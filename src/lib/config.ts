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

export const DEFAULT_AGENT_IDS = ["claude", "codex"];

export const DEFAULT_AGENTS: Agent[] = [
  {
    id: "claude",
    name: "Claude",
    model: "claude",
    avatarColor: "#d97706",
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

/**
 * Enrich a prompt with image and reference-thread instructions.
 * Shared by argv-based spawns (getCliCommand) and the Claude stream-json
 * stdin path, so both produce identical prompt text.
 */
export function enrichPromptWithAttachments(prompt: string, imagePaths?: string[], threadPaths?: string[]): string {
  const hasImages = imagePaths && imagePaths.length > 0;
  let fullPrompt = prompt;
  if (hasImages) {
    const imageList = imagePaths.map((p) => p).join("\n");
    fullPrompt = `IMPORTANT: The user has attached image(s) to this message. You MUST use the Read tool to view each image file BEFORE responding. Image paths:\n${imageList}\n\nUser message: ${prompt}`;
  }

  const hasThreads = threadPaths && threadPaths.length > 0;
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
  return fullPrompt;
}

/**
 * Build argv for a persistent Claude session that reads user messages from
 * stdin as newline-delimited JSON (--input-format stream-json). The prompt is
 * NOT passed on the command line, which avoids Windows' argv length limit
 * (spawn ENAMETOOLONG) for large prompts / full-history fallbacks.
 *
 * The process stays alive across turns; each user message written to stdin
 * produces exactly one `result` event (see process-manager turn handling).
 */
export function getClaudeStreamArgs(
  sessionId: string,
  isResume: boolean,
  personality?: string,
  cliModel?: string,
  permissionLevel: PermissionLevel = "full",
  mcpConfigPath?: string
): string[] {
  const args = [
    "--print",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
  ];
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
  if (cliModel) {
    args.push("--model", cliModel);
  }
  if (mcpConfigPath) {
    args.push("--mcp-config", mcpConfigPath);
  }
  return args;
}

/**
 * Build `-c key=value` config overrides for the codex-acp adapter. These map the
 * app's PermissionLevel onto Codex's own `approval_policy` / `sandbox_mode`
 * settings (the same knobs the `codex` CLI exposes via `-s` and
 * `--dangerously-bypass-approvals-and-sandbox`), plus an optional model override.
 * Values are quoted so codex-acp parses them as TOML strings.
 */
export function getCodexAcpConfigArgs(cliModel: string | undefined, permissionLevel: PermissionLevel = "full"): string[] {
  const args: string[] = [];
  if (cliModel) {
    args.push("-c", `model="${cliModel}"`);
  }
  if (permissionLevel === "full") {
    args.push("-c", `approval_policy="never"`, "-c", `sandbox_mode="danger-full-access"`);
  } else if (permissionLevel === "auto-edit") {
    args.push("-c", `approval_policy="on-request"`, "-c", `sandbox_mode="workspace-write"`);
  } else {
    // "supervised" — read-only sandbox; escalations surface as permission requests
    args.push("-c", `approval_policy="on-request"`, "-c", `sandbox_mode="read-only"`);
  }
  return args;
}

