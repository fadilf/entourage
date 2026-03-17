export type AgentModel = "claude" | "gemini";

export type AgentIcon =
  | { type: "lucide"; name: string }
  | { type: "emoji"; value: string };

export type Agent = {
  id: string;
  name: string;
  model: AgentModel;
  avatarColor: string;
  icon?: AgentIcon;
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
  | { type: "tool_call"; toolCall: ToolCall };

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
  isReattach?: boolean;
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
};
