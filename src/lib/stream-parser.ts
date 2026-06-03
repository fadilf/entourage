import { AgentModel } from "./types";

export type StreamEvent =
  | { type: "content"; text: string }
  | { type: "tool_start"; toolId: string; toolName: string; input?: string }
  | { type: "tool_result"; toolId: string; output: string }
  | { type: "done"; status: "complete" | "error" }
  | { type: "error"; message: string }
  | { type: "permission_denials"; denials: { toolName: string; toolInput?: Record<string, unknown> }[] };



export function createStreamParser(model: AgentModel): (chunk: string) => StreamEvent[] {
  let buffer = "";
  const codexExtractor = model === "codex" ? createCodexEventExtractor() : null;
  // Track whether we've received streaming deltas (to skip duplicate final assistant message)
  let receivedStreamDeltas = false;

  return (chunk: string): StreamEvent[] => {
    buffer += chunk;
    const events: StreamEvent[] = [];
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const json = JSON.parse(trimmed);

        // Claude CLI: handle stream_event wrappers (from --include-partial-messages)
        // These contain raw API events like content_block_delta with incremental text
        if (model === "claude" && json.type === "stream_event" && json.event) {
          const inner = json.event as Record<string, unknown>;
          const innerType = inner.type as string;

          if (innerType === "content_block_delta") {
            const delta = inner.delta as Record<string, unknown> | undefined;
            if (delta?.type === "text_delta" && typeof delta.text === "string") {
              receivedStreamDeltas = true;
              events.push({ type: "content", text: delta.text });
            }
            // Handle tool input deltas (for streaming tool use)
            if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
              receivedStreamDeltas = true;
            }
          }
          // content_block_start, content_block_stop, message_start, message_delta — skip
          continue;
        }

        // Handle error result events from both CLIs
        if (json.type === "result" && (json.status === "error" || json.is_error === true)) {
          const error = json.error as Record<string, unknown> | undefined;
          const errors = json.errors as string[] | undefined;
          const message =
            (typeof error?.message === "string" ? error.message : null) ??
            (Array.isArray(errors) && errors.length > 0 ? errors[0] : null) ??
            "Process ended with an error";
          events.push({ type: "error", message });
          // Fall through to check for permission_denials below
        }

        // Claude CLI: extract permission denials from result events
        if (json.type === "result" && Array.isArray(json.permission_denials) && json.permission_denials.length > 0) {
          const denials = (json.permission_denials as Array<Record<string, unknown>>).map((d) => ({
            toolName: typeof d.tool_name === "string" ? d.tool_name : "unknown",
            ...(d.tool_input ? { toolInput: d.tool_input as Record<string, unknown> } : {}),
          }));
          events.push({ type: "permission_denials", denials });
          continue;
        }

        // Skip further processing for error results (already pushed error event above)
        if (json.type === "result" && (json.status === "error" || json.is_error === true)) {
          continue;
        }

        // Codex CLI events (from --json JSONL)
        if (codexExtractor) {
          const codexEvents = codexExtractor(json);
          events.push(...codexEvents);
          continue;
        }

        // Claude CLI: skip the final assistant message if we already got streaming deltas
        // (the assistant message contains the full text which would duplicate delta content)
        if (model === "claude" && json.type === "assistant" && receivedStreamDeltas) {
          // Still extract tool events from the final message
          const toolEvents = extractClaudeToolEvents(json);
          if (toolEvents.length > 0) {
            events.push(...toolEvents);
          }
          continue;
        }

        // Claude CLI tool events (from stream-json --verbose)
        if (model === "claude") {
          const toolEvents = extractClaudeToolEvents(json);
          if (toolEvents.length > 0) {
            events.push(...toolEvents);
            // Don't continue — the same "assistant" message may also contain text content
            // But if it only had tool_use, extractText will return null anyway
          }
        }

        const text = extractText(json, model);
        if (text) {
          events.push({ type: "content", text });
        }
      } catch {
        // Not JSON — only treat as content for Claude (which may emit plain text)
        // For Codex, non-JSON lines are diagnostic noise
        if (trimmed && model === "claude") {
          events.push({ type: "content", text: trimmed });
        }
      }
    }

    return events;
  };
}

/**
 * Create a stateful Codex event extractor.
 * Tracks cumulative text per item ID to emit only deltas.
 *
 * Codex CLI (--json) emits JSONL with these event types:
 *   thread.started, turn.started, turn.completed, turn.failed, error
 *   item.started, item.updated, item.completed
 *
 * Item types: agent_message, command_execution, file_change,
 *   mcp_tool_call, reasoning, todo_list, web_search, error
 */
function createCodexEventExtractor(): (json: Record<string, unknown>) => StreamEvent[] {
  const lastTextLengths = new Map<string, number>();

  return (json: Record<string, unknown>): StreamEvent[] => {
    const events: StreamEvent[] = [];
    const type = json.type as string;

    // Stream-level error
    if (type === "error" && typeof json.message === "string") {
      events.push({ type: "error", message: json.message });
      return events;
    }

    // Turn failed
    if (type === "turn.failed") {
      const error = json.error as Record<string, unknown> | undefined;
      const message = typeof error?.message === "string" ? error.message : "Turn failed";
      events.push({ type: "error", message });
      return events;
    }

    // Item events
    if (type === "item.started" || type === "item.updated" || type === "item.completed") {
      const item = json.item as Record<string, unknown> | undefined;
      if (!item) return events;

      const itemType = item.type as string;
      const itemId = item.id as string;

      // Agent message — incremental text via delta tracking
      if (itemType === "agent_message" && typeof item.text === "string") {
        const fullText = item.text;
        const lastLen = lastTextLengths.get(itemId) ?? 0;
        if (fullText.length > lastLen) {
          events.push({ type: "content", text: fullText.slice(lastLen) });
          lastTextLengths.set(itemId, fullText.length);
        }
        return events;
      }

      // Command execution
      if (itemType === "command_execution") {
        if (type === "item.started") {
          events.push({
            type: "tool_start",
            toolId: itemId,
            toolName: "shell",
            input: typeof item.command === "string" ? item.command : undefined,
          });
        } else if (type === "item.completed") {
          events.push({
            type: "tool_result",
            toolId: itemId,
            output: typeof item.aggregated_output === "string" ? item.aggregated_output : "",
          });
        }
        return events;
      }

      // File change
      if (itemType === "file_change") {
        if (type === "item.started") {
          events.push({ type: "tool_start", toolId: itemId, toolName: "file_change" });
        } else if (type === "item.completed") {
          const changes = item.changes as Array<Record<string, string>> | undefined;
          const summary = Array.isArray(changes)
            ? changes.map((c) => `${c.kind}: ${c.path}`).join("\n")
            : "";
          events.push({ type: "tool_result", toolId: itemId, output: summary });
        }
        return events;
      }

      // MCP tool call
      if (itemType === "mcp_tool_call") {
        if (type === "item.started") {
          const toolName = typeof item.tool === "string" ? item.tool : "mcp_tool";
          const input = item.arguments ? JSON.stringify(item.arguments) : undefined;
          events.push({ type: "tool_start", toolId: itemId, toolName, input });
        } else if (type === "item.completed") {
          const error = item.error as Record<string, unknown> | undefined;
          if (error && typeof error.message === "string") {
            events.push({ type: "tool_result", toolId: itemId, output: `Error: ${error.message}` });
          } else {
            const result = item.result as Record<string, unknown> | undefined;
            const output = result ? JSON.stringify(result) : "";
            events.push({ type: "tool_result", toolId: itemId, output });
          }
        }
        return events;
      }

      // Error item
      if (itemType === "error" && typeof item.message === "string") {
        events.push({ type: "error", message: item.message });
        return events;
      }
    }

    // Skip: thread.started, turn.started, turn.completed, reasoning, todo_list, web_search, collab_tool_call
    return events;
  };
}

/**
 * Extract tool events from Claude CLI's stream-json format.
 *
 * Claude CLI emits tool calls as full assistant messages:
 *   {"type":"assistant","message":{"content":[{"type":"tool_use","id":"...","name":"Read","input":{...}}]}}
 *
 * And tool results as user messages:
 *   {"type":"user","message":{"content":[{"tool_use_id":"...","type":"tool_result","content":"..."}]}}
 */
function extractClaudeToolEvents(json: Record<string, unknown>): StreamEvent[] {
  const events: StreamEvent[] = [];
  const message = json.message as Record<string, unknown> | undefined;
  if (!message) return events;

  const contentArray = message.content as unknown[] | undefined;
  if (!Array.isArray(contentArray)) return events;

  // Tool use from assistant messages
  if (json.type === "assistant") {
    for (const block of contentArray) {
      const b = block as Record<string, unknown>;
      if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") {
        const input = b.input ? JSON.stringify(b.input) : undefined;
        events.push({ type: "tool_start", toolId: b.id, toolName: b.name, input });
      }
    }
  }

  // Tool results from user messages (tool_result type in content array)
  if (json.type === "user") {
    for (const block of contentArray) {
      const b = block as Record<string, unknown>;
      if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
        const output = typeof b.content === "string" ? b.content : "";
        events.push({ type: "tool_result", toolId: b.tool_use_id, output });
      }
    }
  }

  return events;
}

function extractText(json: Record<string, unknown>, model: AgentModel): string | null {
  // Claude stream-json format
  if (model === "claude") {
    // Assistant message with content array — extract text blocks
    if (json.type === "assistant") {
      const message = json.message as Record<string, unknown> | undefined;
      if (message) {
        const contentArray = message.content as unknown[] | undefined;
        if (Array.isArray(contentArray)) {
          const textParts: string[] = [];
          for (const block of contentArray) {
            const b = block as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string") {
              textParts.push(b.text);
            }
          }
          if (textParts.length > 0) return textParts.join("");
        }
      }
      // Legacy: content as string
      if (typeof json.content === "string") {
        return json.content;
      }
    }
    // Also handle content_block_delta style (API format, just in case)
    if (json.type === "content_block_delta") {
      const delta = json.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.text === "string") {
        return delta.text;
      }
    }
    // Skip "result" events — they duplicate the text already received from "assistant" messages
  }

  return null;
}
