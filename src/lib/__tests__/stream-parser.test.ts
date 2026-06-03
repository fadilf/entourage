import { describe, it, expect } from "vitest";
import { createStreamParser, StreamEvent } from "../stream-parser";

function parse(model: Parameters<typeof createStreamParser>[0], lines: string[]): StreamEvent[] {
  const parser = createStreamParser(model);
  return lines.flatMap((line) => parser(line + "\n"));
}

describe("createStreamParser", () => {
  describe("Claude", () => {
    it("extracts text from assistant messages", () => {
      const events = parse("claude", [
        JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: "Hello world" }] },
        }),
      ]);
      expect(events).toEqual([{ type: "content", text: "Hello world" }]);
    });

    it("extracts tool_use from assistant messages", () => {
      const events = parse("claude", [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [{ type: "tool_use", id: "t1", name: "Read", input: { path: "/foo" } }],
          },
        }),
      ]);
      expect(events).toEqual([
        { type: "tool_start", toolId: "t1", toolName: "Read", input: '{"path":"/foo"}' },
      ]);
    });

    it("extracts tool_result from user messages", () => {
      const events = parse("claude", [
        JSON.stringify({
          type: "user",
          message: {
            content: [{ type: "tool_result", tool_use_id: "t1", content: "file contents" }],
          },
        }),
      ]);
      expect(events).toEqual([{ type: "tool_result", toolId: "t1", output: "file contents" }]);
    });

    it("treats non-JSON lines as content for Claude", () => {
      const events = parse("claude", ["plain text output"]);
      expect(events).toEqual([{ type: "content", text: "plain text output" }]);
    });

    it("ignores non-JSON lines for Codex", () => {
      const events = parse("codex", ["diagnostic noise"]);
      expect(events).toEqual([]);
    });

    it("handles error result events", () => {
      const events = parse("claude", [
        JSON.stringify({
          type: "result",
          status: "error",
          error: { message: "something broke" },
        }),
      ]);
      expect(events).toEqual([{ type: "error", message: "something broke" }]);
    });

    it("handles permission denials", () => {
      const events = parse("claude", [
        JSON.stringify({
          type: "result",
          permission_denials: [{ tool_name: "Bash", tool_input: { command: "rm -rf /" } }],
        }),
      ]);
      expect(events).toEqual([
        {
          type: "permission_denials",
          denials: [{ toolName: "Bash", toolInput: { command: "rm -rf /" } }],
        },
      ]);
    });
  });

  describe("buffering", () => {
    it("handles split chunks across calls", () => {
      const parser = createStreamParser("claude");
      const e1 = parser('{"type":"assistant","message":{"content":[{"type":"text","tex');
      expect(e1).toEqual([]); // incomplete line buffered
      const e2 = parser('t":"hi"}]}}\n');
      expect(e2).toEqual([{ type: "content", text: "hi" }]);
    });
  });
});
