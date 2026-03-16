import { AgentModel } from "./types";

export type StreamEvent =
  | { type: "content"; text: string }
  | { type: "tool_start"; toolId: string; toolName: string; input?: string }
  | { type: "tool_result"; toolId: string; output: string }
  | { type: "done"; status: "complete" | "error" }
  | { type: "error"; message: string };



export function createStreamParser(model: AgentModel): (chunk: string) => StreamEvent[] {
  let buffer = "";

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

        // Handle error result events from both CLIs
        if (json.type === "result" && json.status === "error") {
          const error = json.error as Record<string, unknown> | undefined;
          const message = typeof error?.message === "string" ? error.message : "Process ended with an error";
          events.push({ type: "error", message });
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
        // For Gemini, non-JSON lines are diagnostic noise (errors, warnings, etc.)
        if (trimmed && model === "claude") {
          events.push({ type: "content", text: trimmed });
        }
        // For Gemini, skip non-JSON lines entirely — they're stderr-like diagnostics
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

  // Gemini stream-json format
  if (model === "gemini") {
    // Skip non-content messages (init, user message echo, metadata)
    if (json.type === "init" || json.role === "user") {
      return null;
    }
    if (typeof json.text === "string") {
      return json.text;
    }
    // Only use content field for model responses, not user echoes
    if (typeof json.content === "string" && json.role !== "user") {
      return json.content;
    }
    // Nested parts
    if (json.candidates && Array.isArray(json.candidates)) {
      const parts = (json.candidates[0] as Record<string, unknown>)?.content as Record<string, unknown> | undefined;
      if (parts?.parts && Array.isArray(parts.parts)) {
        const text = (parts.parts[0] as Record<string, unknown>)?.text;
        if (typeof text === "string") return text;
      }
    }
  }

  return null;
}
