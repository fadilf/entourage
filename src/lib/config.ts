import { Agent } from "./types";

export const NEXUS_DIR = ".nexus";
export const THREADS_DIR = "threads";

export const DEFAULT_AGENT_IDS = ["claude", "gemini"];

export const DEFAULT_AGENTS: Agent[] = [
  {
    id: "claude",
    name: "Claude",
    model: "claude",
    avatarColor: "#d97706",
    isDefault: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    model: "gemini",
    avatarColor: "#3b82f6",
    isDefault: true,
  },
];

export function getCliCommand(model: string, prompt: string, sessionId: string, isResume: boolean, personality?: string): { cmd: string; args: string[] } {
  if (model === "claude") {
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"];
    if (isResume) {
      args.push("--resume", sessionId);
    } else {
      args.push("--session-id", sessionId);
    }
    if (personality) {
      args.push("--append-system-prompt", personality);
    }
    return { cmd: "claude", args };
  }

  // Gemini: no --system-instruction flag, prepend to prompt
  let effectivePrompt = prompt;
  if (personality) {
    effectivePrompt = `[System Instructions]\n${personality}\n[End System Instructions]\n\n${prompt}`;
  }

  return {
    cmd: "gemini",
    args: ["-p", effectivePrompt, "--output-format", "stream-json", "--sandbox=none"],
  };
}
