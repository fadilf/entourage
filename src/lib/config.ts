import path from "path";
import { Agent } from "./types";

export const ENTOURAGE_DIR = ".entourage";
export const THREADS_DIR = "threads";
export const UPLOADS_DIR = "uploads";

export function getUploadsDir(workspaceDir?: string): string {
  return path.join(workspaceDir || process.cwd(), ENTOURAGE_DIR, UPLOADS_DIR);
}

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

export function getCliCommand(model: string, prompt: string, sessionId: string, isResume: boolean, personality?: string, imagePaths?: string[]): { cmd: string; args: string[] } {
  const hasImages = imagePaths && imagePaths.length > 0;

  // Build prompt with image instructions
  let fullPrompt = prompt;
  if (hasImages) {
    const imageList = imagePaths.map((p) => p).join("\n");
    fullPrompt = `IMPORTANT: The user has attached image(s) to this message. You MUST use the Read tool to view each image file BEFORE responding. Image paths:\n${imageList}\n\nUser message: ${prompt}`;
  }

  if (model === "claude") {
    const args = ["-p", fullPrompt, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "--chrome"];
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
  let effectivePrompt = fullPrompt;
  if (personality) {
    effectivePrompt = `[System Instructions]\n${personality}\n[End System Instructions]\n\n${fullPrompt}`;
  }

  return {
    cmd: "gemini",
    args: ["-p", effectivePrompt, "--output-format", "stream-json", "--yolo"],
  };
}
