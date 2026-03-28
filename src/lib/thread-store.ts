import { readdir, readFile, writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { ENTOURAGE_DIR, THREADS_DIR } from "./config";
import { Thread, Message, ThreadWithMessages, ThreadListItem, ThreadSearchResult, Agent, PermissionLevel, isAgentModel } from "./types";
import { getProcessManager } from "./process-manager";
import { createKeyedWriteLock } from "./write-lock";

function getThreadsDir(workspaceDir: string): string {
  return path.join(workspaceDir, ENTOURAGE_DIR, THREADS_DIR);
}

function getThreadPath(workspaceDir: string, threadId: string): string {
  return path.join(getThreadsDir(workspaceDir), `${threadId}.json`);
}

const withLock = createKeyedWriteLock();

function sanitizeThreadAgents(thread: Thread): boolean {
  const supportedAgents = thread.agents.filter((agent) =>
    isAgentModel((agent as { model: unknown }).model)
  );
  let changed = supportedAgents.length !== thread.agents.length;

  if (changed) {
    thread.agents = supportedAgents;
  }

  if (thread.unreadAgents) {
    const validAgentIds = new Set(thread.agents.map((agent) => agent.id));
    const unreadAgents = thread.unreadAgents.filter((agentId) => validAgentIds.has(agentId));
    if (unreadAgents.length !== thread.unreadAgents.length) {
      thread.unreadAgents = unreadAgents;
      changed = true;
    }
  }

  return changed;
}

export async function ensureEntourageDir(workspaceDir: string): Promise<void> {
  await mkdir(getThreadsDir(workspaceDir), { recursive: true });
}

export async function listThreads(workspaceDir: string): Promise<ThreadListItem[]> {
  await ensureEntourageDir(workspaceDir);
  const dir = getThreadsDir(workspaceDir);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const items: ThreadListItem[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(dir, file), "utf-8");
      const data = JSON.parse(raw) as ThreadWithMessages;
      const changed = sanitizeThreadAgents(data);
      if (changed) {
        await writeFile(path.join(dir, file), JSON.stringify(data, null, 2));
      }
      const messages = data.messages ?? [];
      const lastMsg = messages[messages.length - 1];
      items.push({
        id: data.id,
        title: data.title,
        agents: data.agents,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        archived: data.archived,
        unreadAgents: data.unreadAgents || [],
        lastMessagePreview: lastMsg?.content?.slice(0, 100) ?? "",
        messageCount: messages.length,
      });
    } catch {
      // Skip corrupt files
    }
  }

  items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return items;
}

function extractSnippet(text: string, query: string, maxLength: number = 120): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return text.slice(0, maxLength);

  const padding = Math.floor((maxLength - query.length) / 2);
  const start = Math.max(0, index - padding);
  const end = Math.min(text.length, start + maxLength);

  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}

export async function searchThreads(workspaceDir: string, query: string): Promise<ThreadSearchResult[]> {
  await ensureEntourageDir(workspaceDir);
  const dir = getThreadsDir(workspaceDir);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const lowerQuery = query.toLowerCase();
  const results: ThreadSearchResult[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(dir, file), "utf-8");
      const data = JSON.parse(raw) as ThreadWithMessages;
      sanitizeThreadAgents(data);

      const messages = data.messages ?? [];
      const lastMsg = messages[messages.length - 1];
      const titleMatches = data.title.toLowerCase().includes(lowerQuery);

      // Search messages for first match
      let messageMatch: string | null = null;
      for (const msg of messages) {
        if (msg.content.toLowerCase().includes(lowerQuery)) {
          messageMatch = msg.content;
          break;
        }
      }

      if (!titleMatches && !messageMatch) continue;

      const base: ThreadListItem = {
        id: data.id,
        title: data.title,
        agents: data.agents,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        archived: data.archived,
        unreadAgents: data.unreadAgents || [],
        lastMessagePreview: lastMsg?.content?.slice(0, 100) ?? "",
        messageCount: messages.length,
      };

      if (messageMatch) {
        results.push({
          ...base,
          matchSnippet: extractSnippet(messageMatch, query),
          matchSource: "message",
        });
      } else {
        results.push({
          ...base,
          matchSnippet: data.title,
          matchSource: "title",
        });
      }
    } catch {
      // Skip corrupt files
    }
  }

  results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return results;
}

export async function getThread(workspaceDir: string, id: string): Promise<ThreadWithMessages | null> {
  try {
    const threadPath = getThreadPath(workspaceDir, id);
    const raw = await readFile(threadPath, "utf-8");
    const thread = JSON.parse(raw) as ThreadWithMessages;
    if (sanitizeThreadAgents(thread)) {
      await writeFile(threadPath, JSON.stringify(thread, null, 2));
    }
    return thread;
  } catch {
    return null;
  }
}

export async function recoverStaleStreams(workspaceDir: string): Promise<void> {
  const threadsDir = getThreadsDir(workspaceDir);
  let files: string[];
  try {
    files = await readdir(threadsDir);
  } catch {
    return;
  }

  const pm = getProcessManager();

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const threadId = file.replace(".json", "");

    await withLock(threadId, async () => {
      const threadPath = getThreadPath(workspaceDir, threadId);
      const raw = await readFile(threadPath, "utf-8");
      const thread = JSON.parse(raw) as ThreadWithMessages;

      let modified = false;
      for (const msg of thread.messages) {
        if (msg.status === "streaming") {
          const agentId = msg.agentId || "";
          const existing = pm.getProcess(threadId, agentId);
          if (!existing) {
            msg.status = "error";
            msg.content += "\n\n[Stream interrupted]";
            modified = true;
          }
        }
      }

      if (modified) {
        await writeFile(threadPath, JSON.stringify(thread, null, 2));
      }
    });
  }
}

export async function addUnreadAgent(
  workspaceDir: string,
  threadId: string,
  agentId: string
): Promise<void> {
  await withLock(threadId, async () => {
    const threadPath = getThreadPath(workspaceDir, threadId);
    const raw = await readFile(threadPath, "utf-8");
    const thread = JSON.parse(raw) as ThreadWithMessages;

    const unreadAgents = thread.unreadAgents || [];
    if (!unreadAgents.includes(agentId)) {
      thread.unreadAgents = [...unreadAgents, agentId];
      await writeFile(threadPath, JSON.stringify(thread, null, 2));
    }
  });
}

export async function clearUnreadAgents(
  workspaceDir: string,
  threadId: string
): Promise<void> {
  await withLock(threadId, async () => {
    const threadPath = getThreadPath(workspaceDir, threadId);
    const raw = await readFile(threadPath, "utf-8");
    const thread = JSON.parse(raw) as ThreadWithMessages;

    if (thread.unreadAgents && thread.unreadAgents.length > 0) {
      thread.unreadAgents = [];
      await writeFile(threadPath, JSON.stringify(thread, null, 2));
    }
  });
}

export async function createThread(workspaceDir: string, title: string, agents: Thread["agents"]): Promise<ThreadWithMessages> {
  await ensureEntourageDir(workspaceDir);
  const now = new Date().toISOString();
  const thread: ThreadWithMessages = {
    id: generateId(),
    title,
    agents,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await writeFile(getThreadPath(workspaceDir, thread.id), JSON.stringify(thread, null, 2));
  return thread;
}

export async function addMessage(workspaceDir: string, threadId: string, message: Omit<Message, "id" | "threadId">): Promise<Message> {
  return withLock(threadId, async () => {
    const thread = await getThread(workspaceDir, threadId);
    if (!thread) throw new Error(`Thread ${threadId} not found`);

    const msg: Message = {
      ...message,
      id: generateId(),
      threadId,
    };
    thread.messages.push(msg);
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(workspaceDir, threadId), JSON.stringify(thread, null, 2));
    return msg;
  });
}

export async function updateMessage(
  workspaceDir: string,
  threadId: string,
  messageId: string,
  updates: Partial<Pick<Message, "content" | "status" | "toolCalls" | "contentBlocks" | "suggestions" | "snapshotTreeHash">>
): Promise<void> {
  return withLock(threadId, async () => {
    const raw = await readFile(getThreadPath(workspaceDir, threadId), "utf-8");
    const thread = JSON.parse(raw) as ThreadWithMessages;
    const msg = thread.messages.find((m) => m.id === messageId);
    if (!msg) return;
    if (updates.content !== undefined) msg.content = updates.content;
    if (updates.status !== undefined) msg.status = updates.status;
    if (updates.toolCalls !== undefined) msg.toolCalls = updates.toolCalls;
    if (updates.contentBlocks !== undefined) msg.contentBlocks = updates.contentBlocks;
    if (updates.suggestions !== undefined) msg.suggestions = updates.suggestions;
    if (updates.snapshotTreeHash !== undefined) msg.snapshotTreeHash = updates.snapshotTreeHash;
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(workspaceDir, threadId), JSON.stringify(thread, null, 2));
  });
}

export async function updateThreadTitle(workspaceDir: string, threadId: string, title: string): Promise<ThreadWithMessages | null> {
  return withLock(threadId, async () => {
    const thread = await getThread(workspaceDir, threadId);
    if (!thread) return null;
    thread.title = title;
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(workspaceDir, threadId), JSON.stringify(thread, null, 2));
    return thread;
  });
}

export async function archiveThread(workspaceDir: string, threadId: string, archived: boolean): Promise<ThreadWithMessages | null> {
  return withLock(threadId, async () => {
    const thread = await getThread(workspaceDir, threadId);
    if (!thread) return null;
    thread.archived = archived;
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(workspaceDir, threadId), JSON.stringify(thread, null, 2));
    return thread;
  });
}

export async function updateThreadPermissionLevel(workspaceDir: string, threadId: string, permissionLevel: PermissionLevel): Promise<ThreadWithMessages | null> {
  return withLock(threadId, async () => {
    const thread = await getThread(workspaceDir, threadId);
    if (!thread) return null;
    thread.permissionLevel = permissionLevel;
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(workspaceDir, threadId), JSON.stringify(thread, null, 2));
    return thread;
  });
}

export async function updateThreadCoordinator(
  workspaceDir: string,
  threadId: string,
  coordinatorId: string | null,
  maxAutoDispatches?: number
): Promise<ThreadWithMessages | null> {
  return withLock(threadId, async () => {
    const thread = await getThread(workspaceDir, threadId);
    if (!thread) return null;
    if (coordinatorId === null) {
      delete thread.coordinatorId;
    } else {
      thread.coordinatorId = coordinatorId;
    }
    if (maxAutoDispatches !== undefined) {
      thread.maxAutoDispatches = maxAutoDispatches;
    }
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(workspaceDir, threadId), JSON.stringify(thread, null, 2));
    return thread;
  });
}

export async function addAgentsToThread(workspaceDir: string, threadId: string, newAgents: Agent[]): Promise<ThreadWithMessages | null> {
  return withLock(threadId, async () => {
    const thread = await getThread(workspaceDir, threadId);
    if (!thread) return null;

    const existingIds = new Set(thread.agents.map((a) => a.id));
    const toAdd = newAgents.filter((a) => !existingIds.has(a.id));
    if (toAdd.length === 0) return thread;

    thread.agents.push(...toAdd);
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(workspaceDir, threadId), JSON.stringify(thread, null, 2));
    return thread;
  });
}

export async function syncThreadAgents(
  workspaceDir: string,
  threadId: string,
  agents: Agent[],
  activeAgentId?: string
): Promise<{ thread: ThreadWithMessages | null; changed: boolean }> {
  return withLock(threadId, async () => {
    const thread = await getThread(workspaceDir, threadId);
    if (!thread) return { thread: null, changed: false };

    const originalOrder = thread.agents.map((agent) => agent.id);
    const existingIds = new Set(originalOrder);
    const toAdd = agents.filter((agent) => !existingIds.has(agent.id));

    if (toAdd.length > 0) {
      thread.agents.push(...toAdd);
    }

    if (activeAgentId) {
      const activeIndex = thread.agents.findIndex((agent) => agent.id === activeAgentId);
      if (activeIndex > 0) {
        const [activeAgent] = thread.agents.splice(activeIndex, 1);
        thread.agents.unshift(activeAgent);
      }
    }

    const changed =
      toAdd.length > 0 ||
      thread.agents.some((agent, index) => agent.id !== originalOrder[index]);

    if (!changed) {
      return { thread, changed: false };
    }

    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(workspaceDir, threadId), JSON.stringify(thread, null, 2));
    return { thread, changed: true };
  });
}

function finalizeRetainedMessages(messages: Message[]): void {
  for (const msg of messages) {
    if (msg.status === "streaming") {
      msg.status = "error";
      msg.content += "\n\n[Stream interrupted]";
    }
  }
}

export async function truncateAfterMessage(
  workspaceDir: string,
  threadId: string,
  messageId: string
): Promise<ThreadWithMessages | null> {
  return withLock(threadId, async () => {
    const raw = await readFile(getThreadPath(workspaceDir, threadId), "utf-8");
    const thread = JSON.parse(raw) as ThreadWithMessages;

    const index = thread.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return null;

    thread.messages = thread.messages.slice(0, index + 1);
    finalizeRetainedMessages(thread.messages);

    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(workspaceDir, threadId), JSON.stringify(thread, null, 2));
    return thread;
  });
}

export async function truncateBeforeMessage(
  workspaceDir: string,
  threadId: string,
  messageId: string
): Promise<ThreadWithMessages | null> {
  return withLock(threadId, async () => {
    const raw = await readFile(getThreadPath(workspaceDir, threadId), "utf-8");
    const thread = JSON.parse(raw) as ThreadWithMessages;

    const index = thread.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return null;

    thread.messages = thread.messages.slice(0, index);
    finalizeRetainedMessages(thread.messages);

    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(workspaceDir, threadId), JSON.stringify(thread, null, 2));
    return thread;
  });
}

export async function deleteThread(workspaceDir: string, threadId: string): Promise<void> {
  try {
    await unlink(getThreadPath(workspaceDir, threadId));
  } catch {
    // Already gone
  }
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
