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
        const text = extractText(json, model);
        if (text) {
          events.push({ type: "content", text });
        }
      } catch {
        // Not JSON — treat as raw text output
        if (trimmed) {
          events.push({ type: "content", text: trimmed });
        }
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
    if (typeof json.text === "string") {
      return json.text;
    }
    if (typeof json.content === "string") {
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
