import { describe, it, expect } from "vitest";
import {
  DEFAULT_CLI_MODELS,
  resolveCliModel,
  getClaudeStreamArgs,
  getCodexAcpConfigArgs,
  enrichPromptWithAttachments,
} from "../config";

describe("resolveCliModel", () => {
  it("uses an explicit agent model override first", () => {
    expect(resolveCliModel("claude", "claude-sonnet-4-6", { claude: "claude-opus-4-1" })).toBe("claude-sonnet-4-6");
  });

  it("falls back to configured app defaults", () => {
    expect(resolveCliModel("codex", undefined, { codex: "gpt-5.5" })).toBe("gpt-5.5");
  });

  it("falls back to built-in defaults when no configured default exists", () => {
    expect(resolveCliModel("codex")).toBe(DEFAULT_CLI_MODELS.codex);
  });
});

describe("getClaudeStreamArgs", () => {
  it("produces a stream-json stdin/stdout command", () => {
    const args = getClaudeStreamArgs("s1", false);
    expect(args).toContain("--print");
    expect(args).toContain("--input-format");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--verbose");
    expect(args).toContain("--session-id");
    expect(args).toContain("s1");
  });

  it("uses --resume for resumed sessions", () => {
    const args = getClaudeStreamArgs("s1", true);
    expect(args).toContain("--resume");
    expect(args).toContain("s1");
    expect(args).not.toContain("--session-id");
  });

  it("maps permission levels to flags", () => {
    expect(getClaudeStreamArgs("s1", false, undefined, undefined, "full")).toContain("--dangerously-skip-permissions");
    const autoEdit = getClaudeStreamArgs("s1", false, undefined, undefined, "auto-edit");
    expect(autoEdit).toContain("--permission-mode");
    expect(autoEdit).toContain("acceptEdits");
    const supervised = getClaudeStreamArgs("s1", false, undefined, undefined, "supervised");
    expect(supervised).not.toContain("--dangerously-skip-permissions");
    expect(supervised).not.toContain("--permission-mode");
  });

  it("appends personality, model, and mcp config", () => {
    const args = getClaudeStreamArgs("s1", false, "be nice", "sonnet", "full", "/tmp/mcp.json");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("be nice");
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).toContain("--mcp-config");
    expect(args).toContain("/tmp/mcp.json");
  });
});

describe("getCodexAcpConfigArgs", () => {
  it("passes the model override as a -c config", () => {
    const args = getCodexAcpConfigArgs("gpt-5.4", "full");
    expect(args).toContain("-c");
    expect(args).toContain('model="gpt-5.4"');
  });

  it("omits the model override when none is given", () => {
    const args = getCodexAcpConfigArgs(undefined, "full");
    expect(args.some((a) => a.startsWith("model="))).toBe(false);
  });

  it("maps full to never approvals + full access", () => {
    const args = getCodexAcpConfigArgs(undefined, "full");
    expect(args).toContain('approval_policy="never"');
    expect(args).toContain('sandbox_mode="danger-full-access"');
  });

  it("maps auto-edit to workspace-write", () => {
    const args = getCodexAcpConfigArgs(undefined, "auto-edit");
    expect(args).toContain('approval_policy="on-request"');
    expect(args).toContain('sandbox_mode="workspace-write"');
  });

  it("maps supervised to read-only", () => {
    const args = getCodexAcpConfigArgs(undefined, "supervised");
    expect(args).toContain('sandbox_mode="read-only"');
  });
});

describe("enrichPromptWithAttachments", () => {
  it("returns the prompt unchanged with no attachments", () => {
    expect(enrichPromptWithAttachments("hello")).toBe("hello");
  });

  it("adds image instructions and paths", () => {
    const out = enrichPromptWithAttachments("describe this", ["/img.png"]);
    expect(out).toContain("attached image(s)");
    expect(out).toContain("/img.png");
    expect(out).toContain("User message: describe this");
  });

  it("injects reference-thread instructions", () => {
    const out = enrichPromptWithAttachments("hello", undefined, ["/workspace/.entourage/threads/abc123.json"]);
    expect(out).toContain("reference conversation thread");
    expect(out).toContain("MUST NOT modify");
    expect(out).toContain("abc123.json");
  });

  it("combines image and thread injection", () => {
    const out = enrichPromptWithAttachments("hello", ["/img.png"], ["/thread.json"]);
    expect(out).toContain("attached image");
    expect(out).toContain("reference conversation thread");
  });
});
