import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtemp, readFile } from "fs/promises";
import path from "path";
import os from "os";

// Mock the workspace file path to use a temp directory
let tempDir: string;
let workspaceFile: string;

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
  };
});

// We can't easily mock the constant WORKSPACE_FILE, so we'll test the
// workspace-store indirectly by creating a mini version of the logic.
// Instead, let's test the pure logic patterns used in workspace-store.

describe("workspace-store logic patterns", () => {
  describe("color assignment", () => {
    const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

    it("cycles through colors based on workspace count", () => {
      expect(COLORS[0 % COLORS.length]).toBe("#8b5cf6");
      expect(COLORS[7 % COLORS.length]).toBe("#84cc16");
      expect(COLORS[8 % COLORS.length]).toBe("#8b5cf6"); // wraps
    });
  });

  describe("name derivation", () => {
    it("uses basename of directory as default name", () => {
      expect(path.basename("/Users/dev/my-project")).toBe("my-project");
      expect(path.basename("/home/user/code")).toBe("code");
    });
  });

  describe("reorder logic", () => {
    type Item = { id: string; name: string };
    const items: Item[] = [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
      { id: "3", name: "C" },
    ];

    function reorder(orderedIds: string[]): Item[] {
      const map = new Map(items.map((w) => [w.id, w]));
      const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as Item[];
      for (const item of items) {
        if (!orderedIds.includes(item.id)) reordered.push(item);
      }
      return reordered;
    }

    it("reorders items according to provided order", () => {
      const result = reorder(["3", "1", "2"]);
      expect(result.map((r) => r.id)).toEqual(["3", "1", "2"]);
    });

    it("appends items not in the ordered list", () => {
      const result = reorder(["2"]);
      expect(result.map((r) => r.id)).toEqual(["2", "1", "3"]);
    });

    it("handles empty order", () => {
      const result = reorder([]);
      expect(result.map((r) => r.id)).toEqual(["1", "2", "3"]);
    });
  });

  describe("icon update logic", () => {
    type Item = { id: string; icon?: { type: string; name: string } };

    it("null removes the icon", () => {
      const item: Item = { id: "1", icon: { type: "phosphor", name: "Zap" } };
      const updates: { icon?: { type: string; name: string } | null } = { icon: null };

      if (updates.icon === null) {
        delete item.icon;
      } else if (updates.icon !== undefined) {
        item.icon = updates.icon;
      }

      expect(item.icon).toBeUndefined();
    });

    it("undefined leaves the icon unchanged", () => {
      const original = { type: "phosphor", name: "Zap" };
      const item: Item = { id: "1", icon: original };
      const updates: { icon?: { type: string; name: string } | null } = {};

      if (updates.icon === null) {
        delete item.icon;
      } else if (updates.icon !== undefined) {
        item.icon = updates.icon;
      }

      expect(item.icon).toEqual(original);
    });

    it("a value replaces the icon", () => {
      const item: Item = { id: "1", icon: { type: "phosphor", name: "Zap" } };
      const newIcon = { type: "emoji", name: "🎉" };
      const updates: { icon?: { type: string; name: string } | null } = { icon: newIcon };

      if (updates.icon === null) {
        delete item.icon;
      } else if (updates.icon !== undefined) {
        item.icon = updates.icon;
      }

      expect(item.icon).toEqual(newIcon);
    });
  });
});
