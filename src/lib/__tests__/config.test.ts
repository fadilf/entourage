import { describe, it, expect } from "vitest";
import { getCliCommand, DEFAULT_CLI_MODELS, resolveCliModel } from "../config";

describe("getCliCommand", () => {
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

  describe("claude", () => {
    it("produces base command with stream-json output", () => {
      const { cmd, args } = getCliCommand("claude", "hello", "s1", false);
      expect(cmd).toBe("claude");
      expect(args).toContain("-p");
      expect(args).toContain("--output-format");
      expect(args).toContain("stream-json");
      expect(args).toContain("--verbose");
      expect(args).toContain("--session-id");
    });

    it("uses --resume for resumed sessions", () => {
      const { args } = getCliCommand("claude", "hi", "s1", true);
      expect(args).toContain("--resume");
      expect(args).toContain("s1");
      expect(args).not.toContain("--session-id");
    });

    it("adds --dangerously-skip-permissions for full permission", () => {
      const { args } = getCliCommand("claude", "hi", "s1", false, undefined, undefined, undefined, "full");
      expect(args).toContain("--dangerously-skip-permissions");
    });

    it("adds --permission-mode acceptEdits for auto-edit", () => {
      const { args } = getCliCommand("claude", "hi", "s1", false, undefined, undefined, undefined, "auto-edit");
      expect(args).toContain("--permission-mode");
      expect(args).toContain("acceptEdits");
    });

    it("adds no permission flag for supervised", () => {
      const { args } = getCliCommand("claude", "hi", "s1", false, undefined, undefined, undefined, "supervised");
      expect(args).not.toContain("--dangerously-skip-permissions");
      expect(args).not.toContain("--permission-mode");
    });

    it("appends personality as system prompt", () => {
      const { args } = getCliCommand("claude", "hi", "s1", false, "be nice");
      expect(args).toContain("--append-system-prompt");
      expect(args).toContain("be nice");
    });

    it("passes through an explicit Claude model", () => {
      const { args } = getCliCommand("claude", "hi", "s1", false, undefined, "sonnet");
      expect(args).toContain("--model");
      expect(args).toContain("sonnet");
    });
  });

  describe("codex", () => {
    it("produces base codex command", () => {
      const { cmd, args, stdin } = getCliCommand("codex", "hello", "s1", false);
      expect(cmd).toBe("codex");
      expect(args).toContain("exec");
      expect(args).toContain("--json");
      expect(args).toContain("--model");
      expect(args).toContain(DEFAULT_CLI_MODELS.codex);
      // Prompt is sent via stdin (`-`), not as an argv arg, to avoid ENAMETOOLONG.
      expect(args[args.length - 1]).toBe("-");
      expect(stdin).toBe("hello");
    });

    it("uses exec resume for resumed sessions", () => {
      const { args } = getCliCommand("codex", "hi", "s1", true);
      expect(args).toContain("exec");
      expect(args).toContain("resume");
      expect(args).toContain("s1");
      expect(args).toContain("--model");
      expect(args).toContain(DEFAULT_CLI_MODELS.codex);
    });

    it("adds bypass flag for full permission", () => {
      const { args } = getCliCommand("codex", "hi", "s1", false, undefined, undefined, undefined, "full");
      expect(args).toContain("--dangerously-bypass-approvals-and-sandbox");
    });

    it("adds workspace-write sandbox for auto-edit", () => {
      const { args } = getCliCommand("codex", "hi", "s1", false, undefined, undefined, undefined, "auto-edit");
      expect(args).toContain("-s");
      expect(args).toContain("workspace-write");
    });

    it("prepends personality in the stdin prompt", () => {
      const { stdin } = getCliCommand("codex", "hello", "s1", false, "be terse");
      expect(stdin).toContain("[System Instructions]");
      expect(stdin).toContain("be terse");
      expect(stdin).toContain("hello");
    });

    it("adds --image= flags for images", () => {
      const { args } = getCliCommand("codex", "look", "s1", false, undefined, undefined, ["/a.png", "/b.png"]);
      expect(args).toContain("--image=/a.png");
      expect(args).toContain("--image=/b.png");
    });

    it("overrides the default Codex model when configured", () => {
      const { args } = getCliCommand("codex", "hello", "s1", false, undefined, "gpt-5.5");
      expect(args).toContain("--model");
      expect(args).toContain("gpt-5.5");
      expect(args).not.toContain(DEFAULT_CLI_MODELS.codex);
    });
  });

  describe("image handling", () => {
    it("adds image instructions to prompt for claude", () => {
      const { args } = getCliCommand("claude", "describe this", "s1", false, undefined, undefined, ["/img.png"]);
      const promptIdx = args.indexOf("-p") + 1;
      expect(args[promptIdx]).toContain("attached image(s)");
      expect(args[promptIdx]).toContain("/img.png");
    });
  });

  describe("thread injection", () => {
    it("injects thread reference paths into claude prompt", () => {
      const threadPaths = ["/workspace/.entourage/threads/abc123.json"];
      const { args } = getCliCommand("claude", "hello", "s1", false, undefined, undefined, undefined, "full", threadPaths);
      const prompt = args[args.indexOf("-p") + 1];
      expect(prompt).toContain("reference conversation thread");
      expect(prompt).toContain("MUST NOT modify");
      expect(prompt).toContain("abc123.json");
      expect(prompt).toContain("User message: hello");
    });

    it("does not inject thread text when no threadPaths provided", () => {
      const { args } = getCliCommand("claude", "hello", "s1", false);
      const prompt = args[args.indexOf("-p") + 1];
      expect(prompt).not.toContain("reference conversation thread");
      expect(prompt).toBe("hello");
    });

    it("combines image and thread injection", () => {
      const { args } = getCliCommand("claude", "hello", "s1", false, undefined, undefined, ["/img.png"], "full", ["/thread.json"]);
      const prompt = args[args.indexOf("-p") + 1];
      expect(prompt).toContain("attached image");
      expect(prompt).toContain("reference conversation thread");
    });
  });
});
