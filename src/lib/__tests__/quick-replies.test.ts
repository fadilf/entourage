import { describe, it, expect } from "vitest";
import { parseQuickReplies, splitQuickReplies } from "../quick-replies";

describe("parseQuickReplies", () => {
  it("extracts suggestions from a well-formed block", () => {
    const content = `Here is my answer.\n<QuickReply>\n<Option>Do X</Option>\n<Option>Do Y</Option>\n</QuickReply>`;
    const result = parseQuickReplies(content);
    expect(result.cleaned).toBe("Here is my answer.");
    expect(result.suggestions).toEqual(["Do X", "Do Y"]);
  });

  it("returns empty suggestions when no block present", () => {
    const result = parseQuickReplies("Just a plain response.");
    expect(result.cleaned).toBe("Just a plain response.");
    expect(result.suggestions).toEqual([]);
  });

  it("ignores incomplete/dangling blocks", () => {
    const content = "Response\n<QuickReply>\n<Option>A</Option>";
    const result = parseQuickReplies(content);
    expect(result.suggestions).toEqual([]);
  });

  it("ignores close tag without open tag", () => {
    const content = "Response\n</QuickReply>";
    const result = parseQuickReplies(content);
    expect(result.suggestions).toEqual([]);
  });

  it("caps at 3 suggestions", () => {
    const content = `Hi\n<QuickReply>\n<Option>A</Option>\n<Option>B</Option>\n<Option>C</Option>\n<Option>D</Option>\n</QuickReply>`;
    const result = parseQuickReplies(content);
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions).toEqual(["A", "B", "C"]);
  });

  it("uses only the last block when multiple exist", () => {
    const content = `Text\n<QuickReply>\n<Option>Old</Option>\n</QuickReply>\nMore text\n<QuickReply>\n<Option>New</Option>\n</QuickReply>`;
    const result = parseQuickReplies(content);
    expect(result.suggestions).toEqual(["New"]);
  });

  it("trims whitespace around options", () => {
    const content = `Answer\n<QuickReply>\n<Option>  spaced  </Option>\n</QuickReply>`;
    const result = parseQuickReplies(content);
    expect(result.suggestions).toEqual(["spaced"]);
  });

  it("skips empty options", () => {
    const content = `Answer\n<QuickReply>\n<Option></Option>\n<Option>Valid</Option>\n</QuickReply>`;
    const result = parseQuickReplies(content);
    expect(result.suggestions).toEqual(["Valid"]);
  });

  it("handles trailing whitespace after close tag", () => {
    const content = `Answer\n<QuickReply>\n<Option>A</Option>\n</QuickReply>   \n`;
    const result = parseQuickReplies(content);
    expect(result.suggestions).toEqual(["A"]);
  });
});

describe("splitQuickReplies", () => {
  it("returns a single text segment when no block present", () => {
    const segments = splitQuickReplies("Just a plain response.");
    expect(segments).toEqual([{ type: "text", text: "Just a plain response." }]);
  });

  it("splits a trailing block into text + quickreply segments", () => {
    const content = `Here is my answer.\n<QuickReply>\n<Option>Do X</Option>\n<Option>Do Y</Option>\n</QuickReply>`;
    const segments = splitQuickReplies(content);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ type: "text", text: "Here is my answer.\n" });
    expect(segments[1]).toEqual({ type: "quickreply", options: ["Do X", "Do Y"] });
  });

  it("renders a block in the middle, keeping text on both sides", () => {
    const content = `Before\n<QuickReply>\n<Option>A</Option>\n</QuickReply>\nAfter`;
    const segments = splitQuickReplies(content);
    expect(segments.map((s) => s.type)).toEqual(["text", "quickreply", "text"]);
    expect(segments[2]).toEqual({ type: "text", text: "\nAfter" });
  });

  it("supports multiple blocks in one response", () => {
    const content = `One\n<QuickReply>\n<Option>A</Option>\n</QuickReply>\nTwo\n<QuickReply>\n<Option>B</Option>\n</QuickReply>`;
    const segments = splitQuickReplies(content);
    const quickReplies = segments.filter((s) => s.type === "quickreply");
    expect(quickReplies).toEqual([
      { type: "quickreply", options: ["A"] },
      { type: "quickreply", options: ["B"] },
    ]);
  });

  it("caps each block at 3 options", () => {
    const content = `Hi\n<QuickReply>\n<Option>A</Option>\n<Option>B</Option>\n<Option>C</Option>\n<Option>D</Option>\n</QuickReply>`;
    const segments = splitQuickReplies(content);
    const qr = segments.find((s) => s.type === "quickreply");
    expect(qr).toEqual({ type: "quickreply", options: ["A", "B", "C"] });
  });

  it("hides an incomplete trailing block while streaming", () => {
    const content = `Answer so far\n<QuickReply>\n<Option>A</Option>`;
    const segments = splitQuickReplies(content, { streaming: true });
    expect(segments).toEqual([{ type: "text", text: "Answer so far\n" }]);
  });

  it("hides a partial open tag while streaming", () => {
    const content = `Answer so far\n<QuickRep`;
    const segments = splitQuickReplies(content, { streaming: true });
    expect(segments).toEqual([{ type: "text", text: "Answer so far\n" }]);
  });

  it("strips an unclosed block even when not streaming", () => {
    const content = `Answer\n<QuickReply>\n<Option>A</Option>`;
    const segments = splitQuickReplies(content);
    expect(segments).toEqual([{ type: "text", text: "Answer\n" }]);
  });

  it("keeps a trailing '<' when not streaming", () => {
    const segments = splitQuickReplies("a < b");
    expect(segments).toEqual([{ type: "text", text: "a < b" }]);
  });

  it("drops a block with no valid options", () => {
    const content = `Text\n<QuickReply>\n<Option></Option>\n</QuickReply>`;
    const segments = splitQuickReplies(content);
    expect(segments).toEqual([{ type: "text", text: "Text\n" }]);
  });
});
