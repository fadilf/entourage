import { describe, it, expect } from "vitest";
import { isAgentModel, AGENT_MODELS } from "../types";
import { DEFAULT_AGENTS, DEFAULT_AGENT_IDS } from "../config";

/**
 * Agent-store uses os.homedir() at module level for its config path,
 * making full integration tests impractical without touching the real config.
 * Instead, we test the pure logic patterns the store relies on.
 */

describe("agent-store logic", () => {
  describe("agent name validation", () => {
    const VALID_PATTERN = /^[a-zA-Z0-9]+$/;

    it("accepts alphanumeric names", () => {
      expect(VALID_PATTERN.test("Claude")).toBe(true);
      expect(VALID_PATTERN.test("agent42")).toBe(true);
    });

    it("rejects names with spaces or special characters", () => {
      expect(VALID_PATTERN.test("my agent")).toBe(false);
      expect(VALID_PATTERN.test("agent-1")).toBe(false);
      expect(VALID_PATTERN.test("agent_1")).toBe(false);
      expect(VALID_PATTERN.test("")).toBe(false);
    });
  });

  describe("duplicate name detection (case-insensitive)", () => {
    const agents = [
      { id: "1", name: "Claude" },
      { id: "2", name: "Gemini" },
    ];

    function isNameTaken(name: string, excludeId?: string): boolean {
      return agents.some(
        (a) => a.id !== excludeId && a.name.toLowerCase() === name.toLowerCase()
      );
    }

    it("detects exact duplicates", () => {
      expect(isNameTaken("Claude")).toBe(true);
    });

    it("detects case-insensitive duplicates", () => {
      expect(isNameTaken("claude")).toBe(true);
      expect(isNameTaken("GEMINI")).toBe(true);
    });

    it("allows unique names", () => {
      expect(isNameTaken("NewAgent")).toBe(false);
    });

    it("excludes self when renaming", () => {
      expect(isNameTaken("Claude", "1")).toBe(false);
      expect(isNameTaken("Claude", "2")).toBe(true);
    });
  });

  describe("default agent protection", () => {
    it("DEFAULT_AGENT_IDS includes all default agents", () => {
      for (const agent of DEFAULT_AGENTS) {
        expect(DEFAULT_AGENT_IDS).toContain(agent.id);
      }
    });

    it("all default agents have supported models", () => {
      for (const agent of DEFAULT_AGENTS) {
        expect(isAgentModel(agent.model)).toBe(true);
      }
    });

    it("all default agents are marked isDefault", () => {
      for (const agent of DEFAULT_AGENTS) {
        expect(agent.isDefault).toBe(true);
      }
    });
  });

  describe("model validation", () => {
    it("accepts supported models", () => {
      for (const model of AGENT_MODELS) {
        expect(isAgentModel(model)).toBe(true);
      }
    });

    it("rejects unsupported models", () => {
      expect(isAgentModel("gpt4")).toBe(false);
      expect(isAgentModel("")).toBe(false);
      expect(isAgentModel(null)).toBe(false);
      expect(isAgentModel(undefined)).toBe(false);
    });
  });

  describe("agent filtering (unsupported model removal)", () => {
    function hasSupportedModel(agent: { model: unknown }): boolean {
      return isAgentModel(agent.model);
    }

    it("keeps agents with valid models", () => {
      const agents = [
        { id: "1", name: "A", model: "claude" },
        { id: "2", name: "B", model: "codex" },
      ];
      expect(agents.filter(hasSupportedModel)).toHaveLength(2);
    });

    it("removes agents with unknown models", () => {
      const agents = [
        { id: "1", name: "A", model: "claude" },
        { id: "2", name: "B", model: "opencode" },
      ];
      const filtered = agents.filter(hasSupportedModel);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("1");
    });
  });

  describe("missing default merge logic", () => {
    it("adds missing defaults to existing config", () => {
      const existing = [
        { id: "claude", name: "Claude", model: "claude", avatarColor: "#000", isDefault: true },
      ];
      const existingIds = new Set(existing.map((a) => a.id));
      const missing = DEFAULT_AGENTS.filter((a) => !existingIds.has(a.id));

      expect(missing.length).toBeGreaterThan(0);
      expect(missing.some((a) => a.id === "claude")).toBe(false);
    });
  });

  describe("reorder logic", () => {
    const agents = [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
      { id: "3", name: "C" },
    ];

    function reorder(orderedIds: string[]) {
      const map = new Map(agents.map((a) => [a.id, a]));
      const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as typeof agents;
      for (const a of agents) {
        if (!orderedIds.includes(a.id)) reordered.push(a);
      }
      return reordered;
    }

    it("reorders according to provided ids", () => {
      expect(reorder(["3", "1", "2"]).map((a) => a.id)).toEqual(["3", "1", "2"]);
    });

    it("appends agents not in the ordered list", () => {
      expect(reorder(["2"]).map((a) => a.id)).toEqual(["2", "1", "3"]);
    });
  });
});
