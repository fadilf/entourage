import { describe, it, expect } from "vitest";
import { mapGitStatus, PLUGINS } from "../plugins";

describe("mapGitStatus", () => {
  it.each([
    ["M", "modified"],
    ["A", "added"],
    ["D", "deleted"],
    ["R", "renamed"],
  ] as const)("maps '%s' to '%s'", (code, expected) => {
    expect(mapGitStatus(code)).toBe(expected);
  });

  it("defaults unknown codes to 'modified'", () => {
    expect(mapGitStatus("X")).toBe("modified");
    expect(mapGitStatus("")).toBe("modified");
  });
});

describe("PLUGINS", () => {
  it("has expected plugin ids", () => {
    const ids = PLUGINS.map((p) => p.id);
    expect(ids).toContain("git");
    expect(ids).toContain("files");
    expect(ids).toContain("terminal");
    expect(ids).toContain("system");
  });

  it("all plugins are disabled by default", () => {
    for (const plugin of PLUGINS) {
      expect(plugin.enabledByDefault).toBe(false);
    }
  });
});
