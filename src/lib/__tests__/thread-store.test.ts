import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile } from "fs/promises";
import path from "path";
import os from "os";
import {
  ensureEntourageDir,
  createThread,
  getThread,
  listThreads,
  addMessage,
  updateMessage,
  updateThreadTitle,
  archiveThread,
  deleteThread,
  addAgentsToThread,
  syncThreadAgents,
  addUnreadAgent,
  clearUnreadAgents,
  truncateAfterMessage,
  truncateBeforeMessage,
  updateThreadPermissionLevel,
  searchThreads,
} from "../thread-store";
import { Agent } from "../types";

const agents: Agent[] = [
  { id: "a1", name: "Claude", model: "claude", avatarColor: "#000" },
  { id: "a2", name: "Gemini", model: "gemini", avatarColor: "#000" },
];

let workspaceDir: string;

beforeEach(async () => {
  workspaceDir = await mkdtemp(path.join(os.tmpdir(), "entourage-test-"));
});

describe("thread-store", () => {
  describe("ensureEntourageDir", () => {
    it("creates the threads directory", async () => {
      await ensureEntourageDir(workspaceDir);
      const { readdir } = await import("fs/promises");
      const entries = await readdir(path.join(workspaceDir, ".entourage", "threads"));
      expect(entries).toEqual([]);
    });
  });

  describe("createThread / getThread", () => {
    it("creates and retrieves a thread", async () => {
      const thread = await createThread(workspaceDir, "Test Thread", agents);
      expect(thread.title).toBe("Test Thread");
      expect(thread.agents).toEqual(agents);
      expect(thread.messages).toEqual([]);

      const retrieved = await getThread(workspaceDir, thread.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.title).toBe("Test Thread");
    });

    it("returns null for nonexistent thread", async () => {
      await ensureEntourageDir(workspaceDir);
      const result = await getThread(workspaceDir, "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listThreads", () => {
    it("returns threads sorted by updatedAt descending", async () => {
      const t1 = await createThread(workspaceDir, "First", [agents[0]]);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      const t2 = await createThread(workspaceDir, "Second", [agents[1]]);

      const list = await listThreads(workspaceDir);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe(t2.id);
      expect(list[1].id).toBe(t1.id);
    });

    it("includes message count and preview", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      await addMessage(workspaceDir, thread.id, {
        role: "user",
        content: "Hello world",
        timestamp: new Date().toISOString(),
        status: "complete",
      });

      const list = await listThreads(workspaceDir);
      expect(list[0].messageCount).toBe(1);
      expect(list[0].lastMessagePreview).toBe("Hello world");
    });
  });

  describe("addMessage / updateMessage", () => {
    it("adds a message to a thread", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      const msg = await addMessage(workspaceDir, thread.id, {
        role: "user",
        content: "Hello",
        timestamp: new Date().toISOString(),
        status: "complete",
      });
      expect(msg.id).toBeDefined();
      expect(msg.threadId).toBe(thread.id);

      const updated = await getThread(workspaceDir, thread.id);
      expect(updated!.messages).toHaveLength(1);
      expect(updated!.messages[0].content).toBe("Hello");
    });

    it("throws when adding to nonexistent thread", async () => {
      await ensureEntourageDir(workspaceDir);
      await expect(
        addMessage(workspaceDir, "nonexistent", {
          role: "user",
          content: "Hi",
          timestamp: new Date().toISOString(),
          status: "complete",
        })
      ).rejects.toThrow("not found");
    });

    it("updates message content and status", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      const msg = await addMessage(workspaceDir, thread.id, {
        role: "assistant",
        agentId: "a1",
        content: "",
        timestamp: new Date().toISOString(),
        status: "streaming",
      });

      await updateMessage(workspaceDir, thread.id, msg.id, {
        content: "Done",
        status: "complete",
      });

      const updated = await getThread(workspaceDir, thread.id);
      expect(updated!.messages[0].content).toBe("Done");
      expect(updated!.messages[0].status).toBe("complete");
    });
  });

  describe("updateThreadTitle", () => {
    it("updates the title", async () => {
      const thread = await createThread(workspaceDir, "Old", agents);
      const result = await updateThreadTitle(workspaceDir, thread.id, "New");
      expect(result!.title).toBe("New");

      const retrieved = await getThread(workspaceDir, thread.id);
      expect(retrieved!.title).toBe("New");
    });

    it("returns null for nonexistent thread", async () => {
      await ensureEntourageDir(workspaceDir);
      const result = await updateThreadTitle(workspaceDir, "nope", "New");
      expect(result).toBeNull();
    });
  });

  describe("archiveThread", () => {
    it("archives and unarchives", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      await archiveThread(workspaceDir, thread.id, true);
      expect((await getThread(workspaceDir, thread.id))!.archived).toBe(true);

      await archiveThread(workspaceDir, thread.id, false);
      expect((await getThread(workspaceDir, thread.id))!.archived).toBe(false);
    });
  });

  describe("deleteThread", () => {
    it("removes the thread file", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      await deleteThread(workspaceDir, thread.id);
      const result = await getThread(workspaceDir, thread.id);
      expect(result).toBeNull();
    });

    it("does not throw for already-deleted thread", async () => {
      await ensureEntourageDir(workspaceDir);
      await expect(deleteThread(workspaceDir, "gone")).resolves.toBeUndefined();
    });
  });

  describe("updateThreadPermissionLevel", () => {
    it("updates the permission level", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      const result = await updateThreadPermissionLevel(workspaceDir, thread.id, "supervised");
      expect(result!.permissionLevel).toBe("supervised");
    });
  });

  describe("unread agents", () => {
    it("adds and clears unread agents", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      await addUnreadAgent(workspaceDir, thread.id, "a1");
      expect((await getThread(workspaceDir, thread.id))!.unreadAgents).toEqual(["a1"]);

      // Adding same agent again should not duplicate
      await addUnreadAgent(workspaceDir, thread.id, "a1");
      expect((await getThread(workspaceDir, thread.id))!.unreadAgents).toEqual(["a1"]);

      await addUnreadAgent(workspaceDir, thread.id, "a2");
      expect((await getThread(workspaceDir, thread.id))!.unreadAgents).toEqual(["a1", "a2"]);

      await clearUnreadAgents(workspaceDir, thread.id);
      expect((await getThread(workspaceDir, thread.id))!.unreadAgents).toEqual([]);
    });
  });

  describe("addAgentsToThread", () => {
    it("adds new agents without duplicating existing ones", async () => {
      const thread = await createThread(workspaceDir, "Test", [agents[0]]);
      const result = await addAgentsToThread(workspaceDir, thread.id, agents);
      expect(result!.agents).toHaveLength(2);
      expect(result!.agents[0].id).toBe("a1");
      expect(result!.agents[1].id).toBe("a2");
    });

    it("returns unchanged thread when all agents already exist", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      const result = await addAgentsToThread(workspaceDir, thread.id, agents);
      expect(result!.agents).toHaveLength(2);
    });
  });

  describe("syncThreadAgents", () => {
    it("adds missing agents and reorders active agent first", async () => {
      const thread = await createThread(workspaceDir, "Test", [agents[0]]);
      const { thread: synced, changed } = await syncThreadAgents(
        workspaceDir, thread.id, agents, "a2"
      );
      expect(changed).toBe(true);
      expect(synced!.agents[0].id).toBe("a2");
      expect(synced!.agents[1].id).toBe("a1");
    });

    it("returns changed=false when nothing changed", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      const { changed } = await syncThreadAgents(workspaceDir, thread.id, agents);
      expect(changed).toBe(false);
    });
  });

  describe("truncateAfterMessage", () => {
    it("keeps messages up to and including the target", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      const m1 = await addMessage(workspaceDir, thread.id, {
        role: "user", content: "first", timestamp: new Date().toISOString(), status: "complete",
      });
      await addMessage(workspaceDir, thread.id, {
        role: "assistant", agentId: "a1", content: "second", timestamp: new Date().toISOString(), status: "complete",
      });
      await addMessage(workspaceDir, thread.id, {
        role: "user", content: "third", timestamp: new Date().toISOString(), status: "complete",
      });

      const result = await truncateAfterMessage(workspaceDir, thread.id, m1.id);
      expect(result!.messages).toHaveLength(1);
      expect(result!.messages[0].content).toBe("first");
    });

    it("marks streaming messages as error when truncating", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      const m1 = await addMessage(workspaceDir, thread.id, {
        role: "assistant", agentId: "a1", content: "partial", timestamp: new Date().toISOString(), status: "streaming",
      });

      const result = await truncateAfterMessage(workspaceDir, thread.id, m1.id);
      expect(result!.messages[0].status).toBe("error");
      expect(result!.messages[0].content).toContain("[Stream interrupted]");
    });
  });

  describe("truncateBeforeMessage", () => {
    it("removes messages before the target", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);
      await addMessage(workspaceDir, thread.id, {
        role: "user", content: "first", timestamp: new Date().toISOString(), status: "complete",
      });
      const m2 = await addMessage(workspaceDir, thread.id, {
        role: "assistant", agentId: "a1", content: "second", timestamp: new Date().toISOString(), status: "complete",
      });
      await addMessage(workspaceDir, thread.id, {
        role: "user", content: "third", timestamp: new Date().toISOString(), status: "complete",
      });

      const result = await truncateBeforeMessage(workspaceDir, thread.id, m2.id);
      expect(result!.messages).toHaveLength(1);
      expect(result!.messages[0].content).toBe("first");
    });
  });

  describe("sanitizeThreadAgents", () => {
    it("removes agents with unsupported models on read", async () => {
      // Write a thread file with a bad model directly
      await ensureEntourageDir(workspaceDir);
      const threadId = "test-sanitize";
      const threadPath = path.join(workspaceDir, ".entourage", "threads", `${threadId}.json`);
      const { writeFile } = await import("fs/promises");
      await writeFile(threadPath, JSON.stringify({
        id: threadId,
        title: "Test",
        agents: [
          { id: "a1", name: "Claude", model: "claude", avatarColor: "#000" },
          { id: "bad", name: "Bad", model: "unsupported_model", avatarColor: "#000" },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      }));

      const thread = await getThread(workspaceDir, threadId);
      expect(thread!.agents).toHaveLength(1);
      expect(thread!.agents[0].id).toBe("a1");

      // Verify it was persisted
      const raw = JSON.parse(await readFile(threadPath, "utf-8"));
      expect(raw.agents).toHaveLength(1);
    });
  });

  describe("searchThreads", () => {
    it("matches thread title", async () => {
      await createThread(workspaceDir, "Deploy Pipeline", agents);
      await createThread(workspaceDir, "Bug Fix", agents);

      const results = await searchThreads(workspaceDir, "deploy");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Deploy Pipeline");
      expect(results[0].matchSource).toBe("title");
      expect(results[0].matchSnippet).toBe("Deploy Pipeline");
    });

    it("matches message content", async () => {
      const thread = await createThread(workspaceDir, "Chat", agents);
      await addMessage(workspaceDir, thread.id, {
        role: "user",
        content: "How do I configure the database connection?",
        timestamp: new Date().toISOString(),
        status: "complete",
      });

      const results = await searchThreads(workspaceDir, "database");
      expect(results).toHaveLength(1);
      expect(results[0].matchSource).toBe("message");
      expect(results[0].matchSnippet).toContain("database");
    });

    it("is case-insensitive", async () => {
      const thread = await createThread(workspaceDir, "Chat", agents);
      await addMessage(workspaceDir, thread.id, {
        role: "user",
        content: "Check the README file",
        timestamp: new Date().toISOString(),
        status: "complete",
      });

      const results = await searchThreads(workspaceDir, "readme");
      expect(results).toHaveLength(1);
    });

    it("prefers message snippet when both title and message match", async () => {
      const thread = await createThread(workspaceDir, "Database Setup", agents);
      await addMessage(workspaceDir, thread.id, {
        role: "user",
        content: "The database connection string is in .env",
        timestamp: new Date().toISOString(),
        status: "complete",
      });

      const results = await searchThreads(workspaceDir, "database");
      expect(results).toHaveLength(1);
      expect(results[0].matchSource).toBe("message");
    });

    it("returns empty array when no matches", async () => {
      await createThread(workspaceDir, "Chat", agents);
      const results = await searchThreads(workspaceDir, "nonexistent");
      expect(results).toHaveLength(0);
    });

    it("returns results sorted by updatedAt descending", async () => {
      const t1 = await createThread(workspaceDir, "Alpha search term", agents);
      await new Promise((r) => setTimeout(r, 10));
      const t2 = await createThread(workspaceDir, "Beta search term", agents);

      const results = await searchThreads(workspaceDir, "search term");
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(t2.id);
      expect(results[1].id).toBe(t1.id);
    });

    it("includes archived threads in results", async () => {
      const thread = await createThread(workspaceDir, "Old Work", agents);
      await archiveThread(workspaceDir, thread.id, true);

      const results = await searchThreads(workspaceDir, "old work");
      expect(results).toHaveLength(1);
      expect(results[0].archived).toBe(true);
    });

    it("generates snippet with context around match", async () => {
      const thread = await createThread(workspaceDir, "Chat", agents);
      const longContent = "A".repeat(80) + " findme " + "B".repeat(80);
      await addMessage(workspaceDir, thread.id, {
        role: "user",
        content: longContent,
        timestamp: new Date().toISOString(),
        status: "complete",
      });

      const results = await searchThreads(workspaceDir, "findme");
      expect(results).toHaveLength(1);
      expect(results[0].matchSnippet).toContain("findme");
      expect(results[0].matchSnippet.length).toBeLessThanOrEqual(150);
    });
  });

  describe("write lock serialization", () => {
    it("handles concurrent writes without corruption", async () => {
      const thread = await createThread(workspaceDir, "Test", agents);

      // Fire off many concurrent addMessage calls
      const promises = Array.from({ length: 10 }, (_, i) =>
        addMessage(workspaceDir, thread.id, {
          role: "user",
          content: `msg-${i}`,
          timestamp: new Date().toISOString(),
          status: "complete",
        })
      );

      await Promise.all(promises);
      const result = await getThread(workspaceDir, thread.id);
      expect(result!.messages).toHaveLength(10);
    });
  });
});
