import { AgentModel } from "./types";

export type StreamEvent =
  | { type: "content"; text: string }
  | { type: "tool_start"; toolId: string; toolName: string; input?: string }
  | { type: "tool_result"; toolId: string; output: string }
  | { type: "schedule_wakeup"; delaySeconds: number; prompt: string; reason?: string }
  | { type: "done"; status: "complete" | "error" }
  | { type: "error"; message: string }
  | { type: "permission_denials"; denials: { toolName: string; toolInput?: Record<string, unknown> }[] };



export function createStreamParser(model: AgentModel): (chunk: string) => StreamEvent[] {
  let buffer = "";
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
      if (b.type !== "tool_use" || typeof b.name !== "string") continue;
      // ScheduleWakeup is surfaced as a dedicated event (drives the auto-continue
      // timer + countdown UI) rather than a generic tool block.
      if (b.name === "ScheduleWakeup") {
        const wakeup = extractScheduleWakeup(b.input);
        if (wakeup) events.push(wakeup);
        continue;
      }
      if (typeof b.id === "string") {
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

/**
 * Parse the input of a `ScheduleWakeup` tool call into a schedule_wakeup event.
 * `delaySeconds` is clamped to the tool's documented [60, 3600] range (defaulting
 * to 60 when missing/invalid). Returns null only if there is no usable input.
 */
function extractScheduleWakeup(rawInput: unknown): Extract<StreamEvent, { type: "schedule_wakeup" }> | null {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  const rawDelay = typeof input.delaySeconds === "number" ? input.delaySeconds : 60;
  const delaySeconds = Math.min(3600, Math.max(60, Math.round(rawDelay) || 60));
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const reason = typeof input.reason === "string" ? input.reason : undefined;
  return { type: "schedule_wakeup", delaySeconds, prompt, ...(reason ? { reason } : {}) };
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
