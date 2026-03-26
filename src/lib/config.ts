import path from "path";
import os from "os";
import { writeFileSync, mkdirSync } from "fs";
import { Agent, AgentModel, CliModelDefaults, McpServerConfig, PermissionLevel } from "./types";

export const ENTOURAGE_DIR = ".entourage";
export const THREADS_DIR = "threads";
export const UPLOADS_DIR = "uploads";
export const DEFAULT_CLI_MODELS: CliModelDefaults = {
  codex: "gpt-5.4",
};

export function getUploadsDir(workspaceDir?: string): string {
  return path.join(workspaceDir || process.cwd(), ENTOURAGE_DIR, UPLOADS_DIR);
}

export const DEFAULT_AGENT_IDS = ["claude", "gemini", "codex"];

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
  {
    id: "codex",
    name: "Codex",
    model: "codex",
    cliModel: DEFAULT_CLI_MODELS.codex,
    avatarColor: "#10a37f",
    isDefault: true,
  },
];

export function resolveCliModel(
  model: AgentModel,
  cliModel?: string,
  defaultCliModels: CliModelDefaults = DEFAULT_CLI_MODELS
): string | undefined {
  return cliModel?.trim() || defaultCliModels[model];
}

const MCP_CONFIG_DIR = path.join(os.tmpdir(), "entourage-mcp");

/**
 * Write MCP server configs to a temp JSON file in the format Claude CLI expects.
 * Returns the file path, or undefined if no servers are configured.
 */
export function writeMcpConfigFile(servers: McpServerConfig[]): string | undefined {
  if (servers.length === 0) return undefined;

  const mcpServers: Record<string, Record<string, unknown>> = {};
  for (const server of servers) {
    if (server.transport === "stdio" && server.command) {
      mcpServers[server.name] = {
        command: server.command,
        args: server.args ?? [],
        ...(server.env && Object.keys(server.env).length > 0 ? { env: server.env } : {}),
      };
    } else if (server.transport === "sse" && server.url) {
      mcpServers[server.name] = {
        type: "http",
        url: server.url,
      };
    }
  }

  if (Object.keys(mcpServers).length === 0) return undefined;

  mkdirSync(MCP_CONFIG_DIR, { recursive: true });
  const configPath = path.join(MCP_CONFIG_DIR, "mcp-servers.json");
  writeFileSync(configPath, JSON.stringify({ mcpServers }, null, 2));
  return configPath;
}

export function getCliCommand(model: AgentModel, prompt: string, sessionId: string, isResume: boolean, personality?: string, cliModel?: string, imagePaths?: string[], permissionLevel: PermissionLevel = "full", threadPaths?: string[], mcpConfigPath?: string): { cmd: string; args: string[] } {
  const hasImages = imagePaths && imagePaths.length > 0;
  const effectiveCliModel = resolveCliModel(model, cliModel);

  // Build prompt with image instructions
  let fullPrompt = prompt;
  if (hasImages) {
    const imageList = imagePaths.map((p) => p).join("\n");
    fullPrompt = `IMPORTANT: The user has attached image(s) to this message. You MUST use the Read tool to view each image file BEFORE responding. Image paths:\n${imageList}\n\nUser message: ${prompt}`;
  }

  const hasThreads = threadPaths && threadPaths.length > 0;

  // Add thread reference instructions
  if (hasThreads) {
    const threadList = threadPaths.map((p) => `- ${p}`).join("\n");
    const threadInstruction = `IMPORTANT: The user has attached reference conversation thread(s) for additional context.\nYou may read these JSON files to understand prior conversations, but you MUST NOT modify, delete, or write to them.\nReference thread files:\n${threadList}`;
    if (hasImages) {
      // Insert thread instruction before "User message:"
      fullPrompt = fullPrompt.replace(
        `\n\nUser message: ${prompt}`,
        `\n\n${threadInstruction}\n\nUser message: ${prompt}`
      );
    } else {
      fullPrompt = `${threadInstruction}\n\nUser message: ${prompt}`;
    }
  }

  if (model === "claude") {
    const args = ["-p", fullPrompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
    const isRoot = process.getuid?.() === 0;
    if (!isRoot) {
      if (permissionLevel === "full") {
        args.push("--dangerously-skip-permissions");
      } else if (permissionLevel === "auto-edit") {
        args.push("--permission-mode", "acceptEdits");
      }
      // "supervised" — no flag, uses CLI default permission mode
    }
    if (isResume) {
      args.push("--resume", sessionId);
    } else {
      args.push("--session-id", sessionId);
    }
    if (personality) {
      args.push("--append-system-prompt", personality);
    }
    if (effectiveCliModel) {
      args.push("--model", effectiveCliModel);
    }
    if (mcpConfigPath) {
      args.push("--mcp-config", mcpConfigPath);
    }
    return { cmd: "claude", args };
  }

  if (model === "codex") {
    let effectivePrompt = fullPrompt;
    if (personality) {
      effectivePrompt = `[System Instructions]\n${personality}\n[End System Instructions]\n\n${effectivePrompt}`;
    }

    const args: string[] = [];
    if (isResume) {
      args.push("exec", "resume", "--json");
      if (permissionLevel === "full") {
        args.push("--dangerously-bypass-approvals-and-sandbox");
      } else if (permissionLevel === "auto-edit") {
        args.push("-s", "workspace-write");
      }
      // "supervised" — no sandbox flag, uses read-only sandbox
      args.push(sessionId);
    } else {
      args.push("exec", "--json");
      if (permissionLevel === "full") {
        args.push("--dangerously-bypass-approvals-and-sandbox");
      } else if (permissionLevel === "auto-edit") {
        args.push("-s", "workspace-write");
      }
      // "supervised" — no sandbox flag, uses read-only sandbox
    }
    if (hasImages) {
      for (const p of imagePaths) {
        // `--image <FILE>...` is variadic; `-i path prompt` causes the prompt to be
        // consumed as another image arg. Use the `--image=<FILE>` form instead.
        args.push(`--image=${p}`);
      }
    }
    if (effectiveCliModel) {
      args.push("--model", effectiveCliModel);
    }
    args.push(effectivePrompt);

    return { cmd: "codex", args };
  }

  // Gemini: no --system-instruction flag, prepend to prompt
  let effectivePrompt = fullPrompt;
  if (personality) {
    effectivePrompt = `[System Instructions]\n${personality}\n[End System Instructions]\n\n${fullPrompt}`;
  }

  const geminiArgs = ["-p", effectivePrompt, "--output-format", "stream-json"];
  if (effectiveCliModel) {
    geminiArgs.push("--model", effectiveCliModel);
  }
  if (permissionLevel === "full") {
    geminiArgs.push("--yolo");
  } else if (permissionLevel === "auto-edit") {
    geminiArgs.push("--approval-mode", "auto_edit");
  }
  // "supervised" — no flag, uses CLI default (dangerous tools excluded)

  return { cmd: "gemini", args: geminiArgs };
}
