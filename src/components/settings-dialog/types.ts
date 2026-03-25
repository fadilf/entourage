import type { AgentModel, Icon, McpServerConfig, PermissionLevel } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";

export type Tab = "general" | "agents" | "plugins" | "mcp";

export type AgentFormData = {
  name: string;
  model: AgentModel;
  cliModel: string;
  avatarColor: string;
  icon?: Icon;
  personality?: string;
};

export type McpServer = McpServerConfig & {
  connected: boolean;
  appToolCount: number;
};

export type CreateMcpServerInput =
  | {
      name: string;
      transport: "sse";
      url: string;
    }
  | {
      name: string;
      transport: "stdio";
      command: string;
      args: string[];
    };

export const SETTINGS_TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "general", label: "General" },
  { key: "agents", label: "Agent Profiles" },
  { key: "plugins", label: "Plugins" },
  { key: "mcp", label: "MCP Servers" },
];

export const PERMISSION_LEVELS: ReadonlyArray<{
  value: PermissionLevel;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "supervised",
    label: "Supervised",
    description: "Read-only — agents can't write files or run commands",
    icon: ShieldAlert,
  },
  {
    value: "auto-edit",
    label: "Auto-Edit",
    description: "File edits allowed, shell commands blocked",
    icon: Shield,
  },
  {
    value: "full",
    label: "Full Autonomy",
    description: "All actions allowed (current default)",
    icon: ShieldCheck,
  },
];

export const COLOR_PRESETS = [
  "#d97706",
  "#3b82f6",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#06b6d4",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#84cc16",
] as const;

export const EMPTY_AGENT_FORM: AgentFormData = {
  name: "",
  model: "claude",
  cliModel: "",
  avatarColor: "#8b5cf6",
};
