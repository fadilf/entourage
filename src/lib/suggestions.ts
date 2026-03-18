import { spawn } from "child_process";
import { Agent } from "./types";

const PROMPT_TEMPLATE = `Given the following AI assistant response, suggest 2-3 short follow-up replies a user might send. Each reply should be under 100 characters. Return ONLY a JSON array of strings, nothing else.

Response:
`;

const LIGHTWEIGHT_MODELS: Record<string, string> = {
  claude: "haiku",
  gemini: "flash",
  codex: "o4-mini",
  opencode: "o4-mini",
};

function buildCommand(agent: Agent, prompt: string): { cmd: string; args: string[] } {
  const model = LIGHTWEIGHT_MODELS[agent.model] ?? "haiku";

  switch (agent.model) {
    case "claude":
      return { cmd: "claude", args: ["-p", prompt, "--model", model] };
    case "gemini":
      return { cmd: "gemini", args: ["-p", prompt, "--model", model] };
    case "codex":
      return {
        cmd: "codex",
        args: ["exec", "-m", model, "--json", "--dangerously-bypass-approvals-and-sandbox", prompt],
      };
    case "opencode":
      return { cmd: "opencode", args: ["run", "--format", "json", "-m", model, prompt] };
    default:
      return { cmd: "claude", args: ["-p", prompt, "--model", "haiku"] };
  }
}

function parseCodexJsonl(output: string): string {
  const lines = output.trim().split("\n");
  let lastText = "";
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === "message" && typeof event.content === "string") {
        lastText = event.content;
      } else if (event.message?.content) {
        lastText = typeof event.message.content === "string"
          ? event.message.content
          : JSON.stringify(event.message.content);
      }
    } catch {
      // skip non-JSON lines
    }
  }
  return lastText;
}

function parseSuggestions(output: string, model: string): string[] {
  let text = output.trim();

  if (model === "codex" || model === "opencode") {
    text = parseCodexJsonl(output);
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed.slice(0, 3);
    }
  } catch {
    // Not valid JSON
  }

  const match = text.match(/\[[\s\S]*?\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
        return parsed.slice(0, 3);
      }
    } catch {
      // fall through
    }
  }

  const lines = text.split("\n").map((l) => l.replace(/^\d+[\.\)]\s*/, "").replace(/^[-*]\s*/, "").replace(/^["']|["']$/g, "").trim()).filter((l) => l.length > 0 && l.length <= 150);
  if (lines.length >= 2) {
    return lines.slice(0, 3);
  }

  return [];
}

export async function generateSuggestions(
  agent: Agent,
  lastMessageContent: string,
  workspaceDir: string
): Promise<string[]> {
  const prompt = PROMPT_TEMPLATE + lastMessageContent;
  const { cmd, args } = buildCommand(agent, prompt);

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", () => {});

    const timer = setTimeout(() => {
      child.kill();
      resolve([]);
    }, 15_000);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve([]);
        return;
      }
      resolve(parseSuggestions(stdout, agent.model));
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
  });
}
