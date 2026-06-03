import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "fs";
import os from "os";
import path from "path";
import { translateAcpUpdate, buildCodexAcpPrompt, decideCodexPermission, toAcpMcpServers } from "../acp-codex";
import { McpServerConfig } from "../types";

describe("translateAcpUpdate", () => {
  it("maps agent_message_chunk text to a content event", () => {
    const events = translateAcpUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "hello" },
    });
    expect(events).toEqual([{ type: "content", text: "hello" }]);
  });

  it("ignores empty / non-text agent message chunks", () => {
    expect(translateAcpUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "" } })).toEqual([]);
    expect(
      translateAcpUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "image", data: "x", mimeType: "image/png" } })
    ).toEqual([]);
  });

  it("maps a tool_call to a tool_start event with serialized input", () => {
    const events = translateAcpUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "c1",
      title: "Run shell",
      kind: "execute",
      status: "pending",
      rawInput: { command: "ls" },
    });
    expect(events).toEqual([
      { type: "tool_start", toolId: "c1", toolName: "Run shell", input: JSON.stringify({ command: "ls" }) },
    ]);
  });

  it("emits both start and result when a tool_call arrives already completed", () => {
    const events = translateAcpUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "c2",
      title: "Read",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "file body" } }],
    });
    expect(events).toEqual([
      { type: "tool_start", toolId: "c2", toolName: "Read", input: undefined },
      { type: "tool_result", toolId: "c2", output: "file body" },
    ]);
  });

  it("maps a completed tool_call_update to a tool_result", () => {
    const events = translateAcpUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "c3",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "done" } }],
    });
    expect(events).toEqual([{ type: "tool_result", toolId: "c3", output: "done" }]);
  });

  it("summarizes diff tool content", () => {
    const events = translateAcpUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "c4",
      status: "completed",
      content: [{ type: "diff", path: "/a.ts", newText: "next" }],
    });
    expect(events).toEqual([{ type: "tool_result", toolId: "c4", output: "/a.ts\nnext" }]);
  });

  it("ignores in-progress tool updates and non-content updates", () => {
    expect(translateAcpUpdate({ sessionUpdate: "tool_call_update", toolCallId: "c5", status: "in_progress" })).toEqual([]);
    expect(translateAcpUpdate({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking" } })).toEqual([]);
    expect(translateAcpUpdate({ sessionUpdate: "plan", entries: [] })).toEqual([]);
  });
});

describe("buildCodexAcpPrompt", () => {
  it("returns a single text block for a plain prompt", () => {
    const blocks = buildCodexAcpPrompt("do the thing");
    expect(blocks).toEqual([{ type: "text", text: "do the thing" }]);
  });

  it("prepends personality as system instructions", () => {
    const [block] = buildCodexAcpPrompt("hi", "be terse");
    expect(block).toMatchObject({ type: "text" });
    expect((block as { text: string }).text).toContain("[System Instructions]\nbe terse");
    expect((block as { text: string }).text).toContain("hi");
  });

  it("includes reference-thread instructions but not image-path instructions", () => {
    const [block] = buildCodexAcpPrompt("hi", undefined, undefined, ["/t.json"]);
    const text = (block as { text: string }).text;
    expect(text).toContain("reference conversation thread");
    expect(text).not.toContain("use the Read tool to view each image");
  });

  it("appends image content blocks for attached images", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "acp-img-"));
    const img = path.join(dir, "pic.png");
    writeFileSync(img, Buffer.from([1, 2, 3, 4]));
    const blocks = buildCodexAcpPrompt("look", undefined, [img]);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toEqual({ type: "image", data: Buffer.from([1, 2, 3, 4]).toString("base64"), mimeType: "image/png" });
  });

  it("skips unreadable images rather than throwing", () => {
    const blocks = buildCodexAcpPrompt("look", undefined, ["/does/not/exist.png"]);
    expect(blocks).toEqual([{ type: "text", text: "look" }]);
  });
});

describe("toAcpMcpServers", () => {
  it("maps a stdio server to the typeless variant with env as name/value pairs", () => {
    const servers: McpServerConfig[] = [
      { id: "1", name: "fs", transport: "stdio", command: "node", args: ["server.js"], env: { TOKEN: "abc" } },
    ];
    expect(toAcpMcpServers(servers)).toEqual([
      { name: "fs", command: "node", args: ["server.js"], env: [{ name: "TOKEN", value: "abc" }] },
    ]);
  });

  it("maps an sse server to the sse transport", () => {
    const servers: McpServerConfig[] = [{ id: "2", name: "remote", transport: "sse", url: "https://mcp.example/sse" }];
    expect(toAcpMcpServers(servers)).toEqual([
      { type: "sse", name: "remote", url: "https://mcp.example/sse", headers: [] },
    ]);
  });

  it("defaults missing args/env to empty", () => {
    const servers: McpServerConfig[] = [{ id: "3", name: "bare", transport: "stdio", command: "tool" }];
    expect(toAcpMcpServers(servers)).toEqual([{ name: "bare", command: "tool", args: [], env: [] }]);
  });

  it("skips incomplete configs (stdio without command, sse without url)", () => {
    const servers: McpServerConfig[] = [
      { id: "4", name: "nocmd", transport: "stdio" },
      { id: "5", name: "nourl", transport: "sse" },
    ];
    expect(toAcpMcpServers(servers)).toEqual([]);
  });
});

describe("decideCodexPermission", () => {
  const options = [
    { optionId: "a1", name: "Allow", kind: "allow_once" as const },
    { optionId: "a2", name: "Allow always", kind: "allow_always" as const },
    { optionId: "r1", name: "Reject", kind: "reject_once" as const },
  ];

  it("rejects under supervised", () => {
    expect(decideCodexPermission(options, "supervised")).toBe("r1");
  });

  it("prefers allow_always under full", () => {
    expect(decideCodexPermission(options, "full")).toBe("a2");
  });

  it("prefers allow_once under auto-edit", () => {
    expect(decideCodexPermission(options, "auto-edit")).toBe("a1");
  });

  it("falls back to the first option when no matching kind exists", () => {
    expect(decideCodexPermission([{ optionId: "x", name: "x", kind: "allow_once" }], "supervised")).toBe("x");
  });

  it("returns null for empty options", () => {
    expect(decideCodexPermission([], "full")).toBeNull();
  });
});
