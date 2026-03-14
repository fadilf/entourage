import { readdir, readFile, writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { NEXUS_DIR, THREADS_DIR } from "./config";
import { Thread, Message, ThreadWithMessages, ThreadListItem } from "./types";

function getWorkingDirectory(): string {
  return process.env.NEXUS_PROJECT_DIR || process.cwd();
}

function getThreadsDir(): string {
  return path.join(getWorkingDirectory(), NEXUS_DIR, THREADS_DIR);
}

function getThreadPath(threadId: string): string {
  return path.join(getThreadsDir(), `${threadId}.json`);
}

// Per-thread write lock to serialize file writes
const locks = new Map<string, Promise<void>>();

function withLock<T>(threadId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(threadId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(threadId, next.then(() => {}, () => {}));
  return next;
}

export async function ensureNexusDir(): Promise<void> {
  await mkdir(getThreadsDir(), { recursive: true });
}

export async function listThreads(): Promise<ThreadListItem[]> {
  await ensureNexusDir();
  const dir = getThreadsDir();
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

export async function getThread(id: string): Promise<ThreadWithMessages | null> {
  try {
    const raw = await readFile(getThreadPath(id), "utf-8");
    const data = JSON.parse(raw) as ThreadWithMessages;
    // Recovery: mark any streaming messages as error
    let modified = false;
    for (const msg of data.messages) {
      if (msg.status === "streaming") {
        msg.status = "error";
        msg.content += "\n\n[Stream interrupted]";
        modified = true;
      }
    }
    if (modified) {
      await writeFile(getThreadPath(id), JSON.stringify(data, null, 2));
    }
    return data;
  } catch {
    return null;
  }
}

export async function createThread(title: string, agents: Thread["agents"]): Promise<ThreadWithMessages> {
  await ensureNexusDir();
  const now = new Date().toISOString();
  const thread: ThreadWithMessages = {
    id: generateId(),
    title,
    agents,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await writeFile(getThreadPath(thread.id), JSON.stringify(thread, null, 2));
  return thread;
}

export async function addMessage(threadId: string, message: Omit<Message, "id" | "threadId">): Promise<Message> {
  return withLock(threadId, async () => {
    const thread = await getThread(threadId);
    if (!thread) throw new Error(`Thread ${threadId} not found`);

    const msg: Message = {
      ...message,
      id: generateId(),
      threadId,
    };
    thread.messages.push(msg);
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(threadId), JSON.stringify(thread, null, 2));
    return msg;
  });
}

export async function updateMessage(
  threadId: string,
  messageId: string,
  updates: Partial<Pick<Message, "content" | "status">>
): Promise<void> {
  return withLock(threadId, async () => {
    const raw = await readFile(getThreadPath(threadId), "utf-8");
    const thread = JSON.parse(raw) as ThreadWithMessages;
    const msg = thread.messages.find((m) => m.id === messageId);
    if (!msg) return;
    if (updates.content !== undefined) msg.content = updates.content;
    if (updates.status !== undefined) msg.status = updates.status;
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(threadId), JSON.stringify(thread, null, 2));
  });
}

export async function updateThreadTitle(threadId: string, title: string): Promise<ThreadWithMessages | null> {
  return withLock(threadId, async () => {
    const thread = await getThread(threadId);
    if (!thread) return null;
    thread.title = title;
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(threadId), JSON.stringify(thread, null, 2));
    return thread;
  });
}

export async function archiveThread(threadId: string, archived: boolean): Promise<ThreadWithMessages | null> {
  return withLock(threadId, async () => {
    const thread = await getThread(threadId);
    if (!thread) return null;
    thread.archived = archived;
    thread.updatedAt = new Date().toISOString();
    await writeFile(getThreadPath(threadId), JSON.stringify(thread, null, 2));
    return thread;
  });
}

export async function deleteThread(threadId: string): Promise<void> {
  try {
    await unlink(getThreadPath(threadId));
  } catch {
    // Already gone
  }
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export { getWorkingDirectory };
