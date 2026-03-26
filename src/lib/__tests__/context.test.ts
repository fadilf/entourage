import { describe, it, expect } from "vitest";
import { buildFullHistoryPrompt, buildContextualPrompt } from "../context";
import { Message, Agent } from "../types";

const agents: Agent[] = [
  { id: "a1", name: "Claude", model: "claude", avatarColor: "#000" },
  { id: "a2", name: "Gemini", model: "gemini", avatarColor: "#000" },
];

function msg(overrides: Partial<Message> & Pick<Message, "role" | "content">): Message {
  return {
    id: "m-" + Math.random().toString(36).slice(2),
    role: overrides.role,
    content: overrides.content,
    timestamp: new Date().toISOString(),
    status: overrides.status ?? "complete",
    agentId: overrides.agentId,
    images: overrides.images,
    attachedThreads: overrides.attachedThreads as Message["attachedThreads"],
  } as Message;
}

describe("buildFullHistoryPrompt", () => {
  it("returns bare prompt when no history", () => {
    const messages = [msg({ role: "user", content: "hello" })];
    expect(buildFullHistoryPrompt(messages, "a1", agents, "hello")).toBe("hello");
  });

  it("includes prior messages with agent names", () => {
    const messages = [
      msg({ role: "user", content: "first" }),
      msg({ role: "assistant", content: "response", agentId: "a1" }),
      msg({ role: "user", content: "second" }),
    ];
    const result = buildFullHistoryPrompt(messages, "a1", agents, "second");
    expect(result).toContain("[Full conversation history");
    expect(result).toContain("User: first");
    expect(result).toContain("Claude (agent): response");
    expect(result).toContain("[End conversation history]");
    expect(result.endsWith("second")).toBe(true);
  });

  it("excludes non-complete assistant messages", () => {
    const messages = [
      msg({ role: "user", content: "q" }),
      msg({ role: "assistant", content: "partial", agentId: "a1", status: "streaming" }),
      msg({ role: "user", content: "retry" }),
    ];
    const result = buildFullHistoryPrompt(messages, "a1", agents, "retry");
    expect(result).not.toContain("partial");
  });

  it("notes attached images", () => {
    const messages = [
      msg({ role: "user", content: "look", images: [{ id: "i1", path: "/img.png", name: "img.png" }] }),
      msg({ role: "user", content: "now" }),
    ];
    const result = buildFullHistoryPrompt(messages, "a1", agents, "now");
    expect(result).toContain("[with 1 image(s)]");
  });
});

describe("buildContextualPrompt", () => {
  it("returns bare prompt when no missed messages", () => {
    const messages = [
      msg({ role: "assistant", content: "hi", agentId: "a1" }),
      msg({ role: "user", content: "next" }),
    ];
    expect(buildContextualPrompt(messages, "a1", agents, "next")).toBe("next");
  });

  it("includes messages from other agents that were missed", () => {
    const messages = [
      msg({ role: "assistant", content: "claude answer", agentId: "a1" }),
      msg({ role: "user", content: "ask gemini" }),
      msg({ role: "assistant", content: "gemini answer", agentId: "a2" }),
      msg({ role: "user", content: "back to claude" }),
    ];
    const result = buildContextualPrompt(messages, "a1", agents, "back to claude");
    expect(result).toContain("[Conversation context");
    expect(result).toContain("User: ask gemini");
    expect(result).toContain("Gemini (agent): gemini answer");
    expect(result.endsWith("back to claude")).toBe(true);
  });

  it("returns bare prompt when agent has no prior messages", () => {
    const messages = [
      msg({ role: "user", content: "first" }),
      msg({ role: "user", content: "second" }),
    ];
    const result = buildContextualPrompt(messages, "a1", agents, "second");
    expect(result).toContain("[Conversation context");
    expect(result).toContain("User: first");
  });
});
