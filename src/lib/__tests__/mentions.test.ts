import { describe, it, expect } from "vitest";
import { parseMentions, stripMentions } from "../mentions";
import { Agent } from "../types";

const agents: Agent[] = [
  { id: "1", name: "Claude", model: "claude", avatarColor: "#7c3aed" },
  { id: "2", name: "Codex", model: "codex", avatarColor: "#2563eb" },
];

describe("parseMentions", () => {
  it("extracts mentioned agents (case-insensitive)", () => {
    const result = parseMentions("@claude help me", agents);
    expect(result).toEqual([agents[0]]);
  });

  it("extracts multiple mentions", () => {
    const result = parseMentions("@claude and @codex review this", agents);
    expect(result).toEqual([agents[0], agents[1]]);
  });

  it("deduplicates repeated mentions", () => {
    const result = parseMentions("@claude do this @claude", agents);
    expect(result).toHaveLength(1);
  });

  it("ignores unknown mentions", () => {
    const result = parseMentions("@unknown agent", agents);
    expect(result).toEqual([]);
  });

  it("returns empty for no mentions", () => {
    const result = parseMentions("just a message", agents);
    expect(result).toEqual([]);
  });
});

describe("stripMentions", () => {
  it("replaces @mention with agent name", () => {
    expect(stripMentions("@claude help", agents)).toBe("Claude help");
  });

  it("preserves unknown @mentions as-is", () => {
    expect(stripMentions("@unknown hi", agents)).toBe("@unknown hi");
  });

  it("is case-insensitive", () => {
    expect(stripMentions("@CLAUDE hi", agents)).toBe("Claude hi");
  });
});
