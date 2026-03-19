export type AgentModel = "claude" | "gemini" | "codex" | "opencode";

export type Icon =
  | { type: "lucide"; name: string }
  | { type: "emoji"; value: string }
  | { type: "image"; imageId: string; ext: string };

export type Agent = {
  id: string;
  name: string;
  model: AgentModel;
  avatarColor: string;
  icon?: Icon;
  personality?: string;
  isDefault?: boolean;
};

export type Thread = {
  id: string;
  title: string;
  agents: Agent[];
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  unreadAgents?: string[];
};

export type MessageImage = {
  id: string;
  filename: string;
  ext: string;
};

export type ToolCall = {
  id: string;
  name: string;
  status: "running" | "complete" | "error";
  input?: string;
  output?: string;
};

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "mcp_app"; toolName: string; serverId: string; toolInput?: Record<string, unknown>; toolResult?: Record<string, unknown>; html?: string };

export type McpServerConfig = {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  // stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse transport
  url?: string;
};

export type Message = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  agentId?: string;
  content: string;
  timestamp: string;
  status: "streaming" | "complete" | "error";
  images?: MessageImage[];
  toolCalls?: ToolCall[];
  contentBlocks?: ContentBlock[];
  suggestions?: string[];
  isReattach?: boolean;
  snapshotTreeHash?: string;
};

export type ThreadWithMessages = Thread & { messages: Message[] };

export type ThreadProcess = {
  threadId: string;
  agentId: string;
  status: "idle" | "running" | "error";
  pid?: number;
};

export type ThreadListItem = Thread & {
  lastMessagePreview: string;
  messageCount: number;
};

export type Workspace = {
  id: string;
  name: string;
  directory: string;
  color: string;
  addedAt: string;
  icon?: Icon;
};

export type Plugin = {
  id: string;
  name: string;
  icon: string;
  enabledByDefault: boolean;
};

export type GitFileEntry = {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
};

export type GitStatus = {
  isRepo: boolean;
  branch: string;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  ahead: number;
  behind: number;
};
