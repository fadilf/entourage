import { readdir, readFile, writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { NEXUS_DIR, THREADS_DIR } from "./config";
import { Thread, Message, ThreadWithMessages, ThreadListItem, Agent } from "./types";
import { getProcessManager } from "./process-manager";

function getWorkingDirectory(): string {
  return process.env.NEXUS_PROJECT_DIR || process.cwd();
}

function getThreadsDir(workspaceDir: string): string {
  return path.join(workspaceDir, NEXUS_DIR, THREADS_DIR);
}

function getThreadPath(workspaceDir: string, threadId: string): string {
  return path.join(getThreadsDir(workspaceDir), `${threadId}.json`);
}

// Per-thread write lock to serialize file writes
const locks = new Map<string, Promise<void>>();

function withLock<T>(threadId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(threadId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(threadId, next.then(() => {}, () => {}));
  return next;
}

export async function ensureNexusDir(workspaceDir: string): Promise<void> {
  await mkdir(getThreadsDir(workspaceDir), { recursive: true });
}

export async function listThreads(workspaceDir: string): Promise<ThreadListItem[]> {
  await ensureNexusDir(workspaceDir);
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

export async function getThread(workspaceDir: string, id: string): Promise<ThreadWithMessages | null> {
  try {
    const raw = await readFile(getThreadPath(workspaceDir, id), "utf-8");
    return JSON.parse(raw) as ThreadWithMessages;
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
  await ensureNexusDir(workspaceDir);
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
  updates: Partial<Pick<Message, "content" | "status" | "toolCalls">>
): Promise<void> {
  return withLock(threadId, async () => {
    const raw = await readFile(getThreadPath(workspaceDir, threadId), "utf-8");
    const thread = JSON.parse(raw) as ThreadWithMessages;
    const msg = thread.messages.find((m) => m.id === messageId);
    if (!msg) return;
    if (updates.content !== undefined) msg.content = updates.content;
    if (updates.status !== undefined) msg.status = updates.status;
    if (updates.toolCalls !== undefined) msg.toolCalls = updates.toolCalls;
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

export { getWorkingDirectory };
