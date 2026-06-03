import { describe, expect, it } from "vitest";
import { isAgentModel } from "../types";

describe("isAgentModel", () => {
  it("accepts supported built-in models", () => {
    expect(isAgentModel("claude")).toBe(true);
    expect(isAgentModel("codex")).toBe(true);
  });

  it("rejects removed or unknown models", () => {
    expect(isAgentModel("gemini")).toBe(false);
    expect(isAgentModel("opencode")).toBe(false);
    expect(isAgentModel("unknown")).toBe(false);
    expect(isAgentModel(null)).toBe(false);
  });
});
