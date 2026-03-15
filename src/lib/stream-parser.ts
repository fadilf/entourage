import { AgentModel } from "./types";

export type StreamEvent =
  | { type: "content"; text: string }
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

function extractText(json: Record<string, unknown>, model: AgentModel): string | null {
  // Claude stream-json format
  if (model === "claude") {
    // Claude emits various event types; content is in "assistant" type with "content" field
    if (json.type === "assistant" && typeof json.content === "string") {
      return json.content;
    }
    // Also handle content_block_delta style
    if (json.type === "content_block_delta") {
      const delta = json.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.text === "string") {
        return delta.text;
      }
    }
    // Result message
    if (json.type === "result" && typeof json.result === "string") {
      return json.result;
    }
    // Simple content field
    if (typeof json.content === "string" && json.content) {
      return json.content;
    }
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
