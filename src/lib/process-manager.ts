import { spawn as cpSpawn, ChildProcess } from "child_process";
import { getClaudeStreamArgs, enrichPromptWithAttachments } from "./config";
import { ThreadProcess, AgentModel, PermissionLevel, McpServerConfig } from "./types";
import { AcpConnection } from "./acp-client";
import { buildCodexAcpPrompt, translateAcpUpdate, decideCodexPermission } from "./acp-codex";
import { StreamEvent } from "./stream-parser";
import type { ContentBlock } from "@agentclientprotocol/sdk";
import crypto from "crypto";

/**
 * Callbacks for a single turn (one user message → one assistant response).
 * For the persistent Claude session, multiple turns share one process; each
 * turn's handlers are queued FIFO and activated as the previous turn ends.
 */
type TurnHandlers = {
  message: string; // The exact JSON-encoded user message text (for retry re-send)
  onData: (chunk: string) => void;
  onTurnEnd: (status: "complete" | "error") => void;
  onError: (err: Error) => void;
};

/**
 * Callbacks for a single Codex/ACP turn. Like TurnHandlers but the adapter
 * streams typed ACP updates rather than raw stdout, so handlers receive already
 * translated StreamEvents and the prompt is carried as ACP content blocks.
 */
type CodexTurn = {
  prompt: ContentBlock[];
  onEvents: (events: StreamEvent[]) => void;
  onTurnEnd: (status: "complete" | "error") => void;
  onError: (err: Error) => void;
};

/** A re-attach listener subscribed to a live ACP turn (page-reload reconnect). */
type AcpSubscriber = {
  onEvents: (events: StreamEvent[]) => void;
  onDone: (status: "complete" | "error") => void;
};

type ProcessEntry = {
  process: ChildProcess;
  threadId: string;
  agentId: string;
  model: AgentModel;
  status: "running" | "error";
  buffer: string[]; // Recent stdout chunks for re-attachment
  stderrBuffer: string[]; // Stderr output (not shown as content)
  accumulatedContent: string; // Full parsed content for re-attachment
  accumulatedBlocks: import("./types").ContentBlock[]; // Full content blocks for re-attachment
  // --- Persistent Claude session fields (undefined for one-shot codex spawns) ---
  persistent?: boolean;
  sessionId?: string; // Session id this process was spawned with
  isResume?: boolean; // Whether this process was spawned with --resume
  turnQueue?: TurnHandlers[]; // FIFO of pending/active turns; front = active
  lineBuf?: string; // Manager-side line buffer for result-boundary detection
  everSucceeded?: boolean; // Has any turn completed successfully (for resume fallback)
  retried?: boolean; // Has the resume→fresh fallback already fired once
  killed?: boolean; // Intentionally terminated (stop/rewind/idle) — suppress retry
  idleTimer?: NodeJS.Timeout; // Kills the process after a period with no active turn
  // --- Persistent Codex (ACP) session fields ---
  acp?: AcpConnection; // ACP connection wrapping the codex-acp adapter
  acpSessionId?: string; // The ACP session id from session/new
  codexTurnQueue?: CodexTurn[]; // FIFO of pending/active ACP turns; front = active
  codexDraining?: boolean; // Whether runCodexQueue is currently draining the queue
  subscribers?: Set<AcpSubscriber>; // Re-attach listeners on the live turn
};

const MAX_BUFFER_CHUNKS = 100;
// Kill an idle persistent Claude session after this long with no active turn.
// The next turn cold-starts via --resume, preserving context.
const PERSISTENT_IDLE_MS = 5 * 60 * 1000;

/**
 * Extract a user-friendly error message from raw stderr output.
 * Looks for common error patterns and avoids dumping stack traces.
 */
function summarizeStderr(stderr: string): string {
  // Look for common error patterns
  const patterns = [
    /Error: (.+?)(?:\n|$)/,           // Generic "Error: message"
    /GaxiosError: (.+?)(?:\n|$)/,     // Google API errors
    /error: (.+?)(?:\n|$)/i,          // Lowercase error
    /failed with status (\d+)/i,      // HTTP status failures
  ];

  for (const pattern of patterns) {
    const match = stderr.match(pattern);
    if (match) return match[0].trim();
  }

  // Fallback: first meaningful line, capped at 200 chars
  const firstLine = stderr.split("\n").find((l) => l.trim().length > 0)?.trim() ?? stderr.trim();
  return firstLine.length > 200 ? firstLine.slice(0, 200) + "..." : firstLine;
}

class ProcessManager {
  private processes = new Map<string, ProcessEntry>();
  private usedSessions = new Set<string>(); // Track sessions that have been used
  private killedSessions = new Set<string>(); // Track sessions killed intentionally
  private sessionOverrides = new Map<string, string>(); // Override sessionId after rewind

  private key(threadId: string, agentId: string): string {
    return `${threadId}:${agentId}`;
  }

  private baseSessionId(threadId: string, agentId: string): string {
    const hash = crypto
      .createHash("sha256")
      .update(`${threadId}:${agentId}`)
      .digest("hex");
    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      "4" + hash.slice(13, 16),
      ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
      hash.slice(20, 32),
    ].join("-");
  }

  private getSessionId(threadId: string, agentId: string): string {
    const k = this.key(threadId, agentId);
    return this.sessionOverrides.get(k) ?? this.baseSessionId(threadId, agentId);
  }

  private newSessionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Start a turn on the persistent Claude session for (threadId, agentId).
   * If a live session already exists, the message is queued onto it (written to
   * stdin). Otherwise a new persistent process is spawned. Each user message
   * produces exactly one `result` event, which ends that turn and activates the
   * next queued one. The prompt travels via stdin, so it never hits the OS argv
   * length limit (fixes spawn ENAMETOOLONG for large prompts).
   */
  startClaudeTurn(
    threadId: string,
    agentId: string,
    cliModel: string | undefined,
    prompt: string,
    cwd: string,
    onData: (chunk: string) => void,
    onTurnEnd: (status: "complete" | "error") => void,
    onError: (err: Error) => void,
    hasHistory: boolean = false,
    personality?: string,
    imagePaths?: string[],
    fullHistoryPrompt?: string,
    permissionLevel: PermissionLevel = "full",
    threadPaths?: string[],
    mcpConfigPath?: string
  ): void {
    const k = this.key(threadId, agentId);
    const messageText = enrichPromptWithAttachments(prompt, imagePaths, threadPaths);

    const existing = this.processes.get(k);
    if (existing && existing.persistent && existing.status === "running" && existing.process.stdin?.writable) {
      // Live session — queue this turn and submit it to stdin.
      if (existing.idleTimer) { clearTimeout(existing.idleTimer); existing.idleTimer = undefined; }
      existing.turnQueue!.push({ message: messageText, onData, onTurnEnd, onError });
      this.writeUserMessage(existing.process, messageText);
      return;
    }

    // No live session — cold start.
    const sessionId = this.getSessionId(threadId, agentId);
    const wasRewound = this.sessionOverrides.has(k);
    const isResume = (this.usedSessions.has(sessionId) || hasHistory) && !wasRewound;
    // After a rewind, the on-disk session still has rewound messages, so start
    // fresh with full history; otherwise resume (or start a new session).
    const firstMessage = (!isResume && wasRewound && fullHistoryPrompt)
      ? enrichPromptWithAttachments(fullHistoryPrompt, imagePaths, threadPaths)
      : messageText;
    // Enriched full-history text used if a --resume cold start turns out to be stale.
    const fullHistoryMessage = enrichPromptWithAttachments(fullHistoryPrompt ?? prompt, imagePaths, threadPaths);

    this.spawnPersistentClaude(
      threadId, agentId, sessionId, isResume, cliModel, personality,
      permissionLevel, mcpConfigPath, cwd, fullHistoryMessage,
      [{ message: firstMessage, onData, onTurnEnd, onError }]
    );
  }

  private writeUserMessage(child: ChildProcess, text: string): void {
    const line = JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text }] },
    }) + "\n";
    try { child.stdin?.write(line); } catch { /* stdin closed */ }
  }

  private spawnPersistentClaude(
    threadId: string,
    agentId: string,
    sessionId: string,
    isResume: boolean,
    cliModel: string | undefined,
    personality: string | undefined,
    permissionLevel: PermissionLevel,
    mcpConfigPath: string | undefined,
    cwd: string,
    fullHistoryMessage: string,
    turnQueue: TurnHandlers[]
  ): void {
    const k = this.key(threadId, agentId);
    const args = getClaudeStreamArgs(sessionId, isResume, personality, cliModel, permissionLevel, mcpConfigPath);
    const child = cpSpawn("claude", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const entry: ProcessEntry = {
      process: child,
      threadId,
      agentId,
      model: "claude",
      status: "running",
      buffer: [],
      stderrBuffer: [],
      accumulatedContent: "",
      accumulatedBlocks: [],
      persistent: true,
      sessionId,
      isResume,
      turnQueue,
      lineBuf: "",
      everSucceeded: false,
      retried: false,
    };
    this.processes.set(k, entry);

    // Submit all currently-queued messages in order (normally just the first).
    for (const h of turnQueue) {
      this.writeUserMessage(child, h.message);
    }

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      entry.buffer.push(chunk);
      if (entry.buffer.length > MAX_BUFFER_CHUNKS) entry.buffer.shift();

      entry.lineBuf = (entry.lineBuf ?? "") + chunk;
      const lines = entry.lineBuf.split("\n");
      entry.lineBuf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        let json: Record<string, unknown> | null = null;
        if (trimmed) { try { json = JSON.parse(trimmed); } catch { json = null; } }

        const isResultErr =
          json?.type === "result" &&
          (json.is_error === true || json.subtype === "error_during_execution");

        // Resume fallback: a resumed session whose first turn errors before ever
        // succeeding usually means the on-disk session was lost. Restart fresh
        // with full-history context instead of forwarding the error.
        if (isResultErr && entry.isResume && !entry.everSucceeded && !entry.retried) {
          entry.retried = true;
          this.restartPersistentFresh(threadId, agentId, sessionId, cliModel, personality, permissionLevel, mcpConfigPath, cwd, fullHistoryMessage);
          return;
        }

        const active = entry.turnQueue![0];
        if (active) {
          try { active.onData(line + "\n"); } catch { /* controller closed */ }
        }

        if (json?.type === "result") {
          const finished = entry.turnQueue!.shift();
          const isError = json.is_error === true || json.subtype === "error_during_execution";
          if (!isError) {
            entry.everSucceeded = true;
            this.killedSessions.delete(sessionId);
            this.sessionOverrides.delete(k);
            this.usedSessions.add(sessionId);
          }
          try { finished?.onTurnEnd(isError ? "error" : "complete"); } catch { /* ignore */ }
          if (entry.turnQueue!.length === 0) {
            this.armIdleTimer(entry);
          }
        }
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      entry.stderrBuffer.push(chunk);
      if (entry.stderrBuffer.length > MAX_BUFFER_CHUNKS) entry.stderrBuffer.shift();
    });

    child.on("error", (err) => {
      entry.status = "error";
      const message = (err as NodeJS.ErrnoException).code === "ENOENT"
        ? `CLI "claude" not found. Make sure it is installed and in your PATH.`
        : err.message;
      for (const h of entry.turnQueue ?? []) {
        try { h.onError(new Error(message)); } catch { /* ignore */ }
      }
      entry.turnQueue = [];
    });

    child.on("close", (code) => {
      if (entry.idleTimer) { clearTimeout(entry.idleTimer); entry.idleTimer = undefined; }
      // Resume fallback on unexpected exit before any turn succeeded.
      if (!entry.killed && entry.isResume && !entry.everSucceeded && !entry.retried && (entry.turnQueue?.length ?? 0) > 0) {
        entry.retried = true;
        this.restartPersistentFresh(threadId, agentId, sessionId, cliModel, personality, permissionLevel, mcpConfigPath, cwd, fullHistoryMessage);
        return;
      }
      // Fail any turns still in flight.
      const pending = entry.turnQueue ?? [];
      const stderrText = entry.stderrBuffer.join("").trim();
      for (const h of pending) {
        if (code !== 0 && stderrText) {
          try { h.onError(new Error(summarizeStderr(stderrText))); } catch { /* ignore */ }
        } else {
          try { h.onTurnEnd(code === 0 ? "complete" : "error"); } catch { /* ignore */ }
        }
      }
      entry.turnQueue = [];
      if (this.processes.get(k) === entry) this.processes.delete(k);
    });
  }

  private restartPersistentFresh(
    threadId: string,
    agentId: string,
    sessionId: string,
    cliModel: string | undefined,
    personality: string | undefined,
    permissionLevel: PermissionLevel,
    mcpConfigPath: string | undefined,
    cwd: string,
    fullHistoryMessage: string
  ): void {
    const k = this.key(threadId, agentId);
    const old = this.processes.get(k);
    const queue = old?.turnQueue ?? [];
    // Detach the queue from the old entry so its close handler can't fail these
    // turns after we've moved them to the fresh process.
    if (old) {
      old.turnQueue = [];
      if (old.idleTimer) { clearTimeout(old.idleTimer); old.idleTimer = undefined; }
    }
    // Replace the first (failed) turn's message with full-history text so the
    // fresh session has the whole conversation; keep any later queued messages.
    if (queue.length > 0) {
      queue[0] = { ...queue[0], message: fullHistoryMessage };
    }
    this.processes.delete(k);
    try { old?.process.kill("SIGKILL"); } catch { /* already dead */ }
    // Fresh session (not resume) reusing the same deterministic sessionId.
    this.spawnPersistentClaude(
      threadId, agentId, sessionId, false, cliModel, personality,
      permissionLevel, mcpConfigPath, cwd, fullHistoryMessage, queue
    );
  }

  /**
   * Start a turn on the persistent Codex (ACP) session for (threadId, agentId).
   * If a live session exists, the message is queued and sent via session/prompt
   * after the current turn finishes (send-while-running). Otherwise the codex-acp
   * adapter is spawned and a new session created. On cold start with prior
   * history, the full-history prompt seeds the fresh session (ACP loadSession is
   * not used — newSession + full history mirrors the Claude resume fallback).
   */
  startCodexTurn(
    threadId: string,
    agentId: string,
    cliModel: string | undefined,
    prompt: string,
    cwd: string,
    onEvents: (events: StreamEvent[]) => void,
    onTurnEnd: (status: "complete" | "error") => void,
    onError: (err: Error) => void,
    hasHistory: boolean = false,
    personality?: string,
    imagePaths?: string[],
    fullHistoryPrompt?: string,
    permissionLevel: PermissionLevel = "full",
    threadPaths?: string[],
    mcpServers?: McpServerConfig[]
  ): void {
    const k = this.key(threadId, agentId);
    const existing = this.processes.get(k);

    if (existing && existing.acp && existing.persistent && existing.status === "running") {
      // Live session — queue this turn onto it.
      if (existing.idleTimer) { clearTimeout(existing.idleTimer); existing.idleTimer = undefined; }
      const blocks = buildCodexAcpPrompt(prompt, personality, imagePaths, threadPaths);
      existing.codexTurnQueue!.push({ prompt: blocks, onEvents, onTurnEnd, onError });
      if (!existing.codexDraining) void this.runCodexQueue(existing);
      return;
    }

    // No live session — cold start. Seed with full history if there's prior context.
    const firstText = (hasHistory && fullHistoryPrompt) ? fullHistoryPrompt : prompt;
    const firstBlocks = buildCodexAcpPrompt(firstText, personality, imagePaths, threadPaths);
    this.spawnPersistentCodex(
      threadId, agentId, cliModel, permissionLevel, cwd, mcpServers,
      [{ prompt: firstBlocks, onEvents, onTurnEnd, onError }]
    );
  }

  private spawnPersistentCodex(
    threadId: string,
    agentId: string,
    cliModel: string | undefined,
    permissionLevel: PermissionLevel,
    cwd: string,
    mcpServers: McpServerConfig[] | undefined,
    queue: CodexTurn[]
  ): void {
    const k = this.key(threadId, agentId);
    const acp = new AcpConnection({ cwd, cliModel, permissionLevel, mcpServers });

    const entry: ProcessEntry = {
      process: acp.child,
      acp,
      threadId,
      agentId,
      model: "codex",
      status: "running",
      buffer: [],
      stderrBuffer: [],
      accumulatedContent: "",
      accumulatedBlocks: [],
      persistent: true,
      codexTurnQueue: queue,
      codexDraining: false,
      everSucceeded: false,
      subscribers: new Set(),
    };
    this.processes.set(k, entry);

    acp.onSessionUpdate = (update) => {
      const events = translateAcpUpdate(update);
      if (events.length === 0) return;
      const active = entry.codexTurnQueue?.[0];
      if (active) { try { active.onEvents(events); } catch { /* controller closed */ } }
      entry.subscribers?.forEach((s) => { try { s.onEvents(events); } catch { /* ignore */ } });
    };
    acp.onPermissionRequest = (options) => decideCodexPermission(options, permissionLevel);
    acp.onStderr = (chunk) => {
      entry.stderrBuffer.push(chunk);
      if (entry.stderrBuffer.length > MAX_BUFFER_CHUNKS) entry.stderrBuffer.shift();
    };
    acp.onClose = () => {
      if (entry.idleTimer) { clearTimeout(entry.idleTimer); entry.idleTimer = undefined; }
      if (this.processes.get(k) === entry) this.processes.delete(k);
      if (entry.killed) return; // Intentional shutdown — turns already settled.
      // Unexpected exit: fail any pending turns and close re-attach streams.
      const stderrText = entry.stderrBuffer.join("").trim();
      for (const t of entry.codexTurnQueue ?? []) {
        if (stderrText) { try { t.onError(new Error(summarizeStderr(stderrText))); } catch { /* ignore */ } }
        else { try { t.onTurnEnd("error"); } catch { /* ignore */ } }
      }
      entry.codexTurnQueue = [];
      entry.subscribers?.forEach((s) => { try { s.onDone("error"); } catch { /* ignore */ } });
    };
    acp.onError = (err) => {
      entry.status = "error";
      for (const t of entry.codexTurnQueue ?? []) { try { t.onError(err); } catch { /* ignore */ } }
      entry.codexTurnQueue = [];
    };

    // Establish the connection and drain the queue.
    void this.driveCodex(entry).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      for (const t of entry.codexTurnQueue ?? []) { try { t.onError(new Error(message)); } catch { /* ignore */ } }
      entry.codexTurnQueue = [];
      entry.subscribers?.forEach((s) => { try { s.onDone("error"); } catch { /* ignore */ } });
      this.kill(threadId, agentId);
    });
  }

  private async driveCodex(entry: ProcessEntry): Promise<void> {
    const acp = entry.acp!;
    await acp.connect();
    await acp.initialize();
    entry.acpSessionId = await acp.newSession();
    await this.runCodexQueue(entry);
  }

  /** Drain the ACP turn queue, running one session/prompt at a time (FIFO). */
  private async runCodexQueue(entry: ProcessEntry): Promise<void> {
    if (entry.codexDraining) return;
    if (!entry.acp || !entry.acpSessionId) return;
    entry.codexDraining = true;
    try {
      while (!entry.killed && entry.codexTurnQueue && entry.codexTurnQueue.length > 0) {
        const turn = entry.codexTurnQueue[0];
        try {
          await entry.acp.prompt(entry.acpSessionId, turn.prompt);
        } catch (err) {
          entry.codexTurnQueue.shift();
          const e = err instanceof Error ? err : new Error(String(err));
          try { turn.onError(e); } catch { /* ignore */ }
          entry.subscribers?.forEach((s) => { try { s.onDone("error"); } catch { /* ignore */ } });
          continue;
        }
        // Any stop reason (end_turn, refusal, cancelled, …) ends the turn with the
        // content produced so far; only thrown errors are treated as failures.
        entry.codexTurnQueue.shift();
        entry.everSucceeded = true;
        try { turn.onTurnEnd("complete"); } catch { /* ignore */ }
        entry.subscribers?.forEach((s) => { try { s.onDone("complete"); } catch { /* ignore */ } });
      }
    } finally {
      entry.codexDraining = false;
      if ((entry.codexTurnQueue?.length ?? 0) === 0) this.armIdleTimer(entry);
    }
  }

  private armIdleTimer(entry: ProcessEntry): void {
    if (entry.killed) return;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      const pending = (entry.turnQueue?.length ?? 0) + (entry.codexTurnQueue?.length ?? 0);
      if (pending === 0 && entry.status === "running") {
        entry.killed = true;
        if (entry.acp && entry.acpSessionId) entry.acp.cancel(entry.acpSessionId);
        try { entry.process.stdin?.end(); } catch { /* ignore */ }
        try { entry.process.kill("SIGTERM"); } catch { /* ignore */ }
      }
    }, PERSISTENT_IDLE_MS);
    entry.idleTimer.unref?.();
  }

  kill(threadId: string, agentId: string): void {
    const k = this.key(threadId, agentId);
    const entry = this.processes.get(k);
    if (!entry) return;

    entry.killed = true;
    if (entry.idleTimer) { clearTimeout(entry.idleTimer); entry.idleTimer = undefined; }
    if (entry.acp && entry.acpSessionId) entry.acp.cancel(entry.acpSessionId);
    if (entry.persistent && !entry.acp) { try { entry.process.stdin?.end(); } catch { /* ignore */ } }
    try {
      entry.process.kill("SIGTERM");
      // Force kill after 5s
      const timer = setTimeout(() => {
        try {
          entry.process.kill("SIGKILL");
        } catch {
          // Already dead
        }
      }, 5000);
      entry.process.on("close", () => clearTimeout(timer));
    } catch {
      // Already dead
    }
    this.processes.delete(k);
  }

  /**
   * Whether an entry is actively producing a turn right now. A persistent
   * Claude session that is alive but between turns (empty queue) is NOT active —
   * it should not block rewinds or show a streaming badge.
   */
  private isActive(entry: ProcessEntry): boolean {
    if (entry.status !== "running") return false;
    if (entry.persistent) return ((entry.turnQueue?.length ?? 0) + (entry.codexTurnQueue?.length ?? 0)) > 0;
    return true;
  }

  isThreadStreaming(threadId: string): boolean {
    for (const [, entry] of this.processes) {
      if (entry.threadId === threadId && this.isActive(entry)) {
        return true;
      }
    }
    return false;
  }

  killByThread(threadId: string): void {
    const toKill: string[] = [];
    for (const [key, entry] of this.processes) {
      if (entry.threadId === threadId) {
        const sessionId = this.getSessionId(entry.threadId, entry.agentId);
        this.usedSessions.delete(sessionId);
        this.killedSessions.add(sessionId);
        entry.killed = true;
        if (entry.idleTimer) { clearTimeout(entry.idleTimer); entry.idleTimer = undefined; }
        if (entry.acp && entry.acpSessionId) entry.acp.cancel(entry.acpSessionId);
        if (entry.persistent && !entry.acp) { try { entry.process.stdin?.end(); } catch { /* ignore */ } }
        try {
          entry.process.kill("SIGTERM");
          const timer = setTimeout(() => {
            try { entry.process.kill("SIGKILL"); } catch { /* already dead */ }
          }, 5000);
          entry.process.on("close", () => clearTimeout(timer));
        } catch { /* already dead */ }
        toKill.push(key);
      }
    }
    for (const key of toKill) {
      this.processes.delete(key);
    }
  }

  /**
   * Reset session IDs for all agents in a thread (e.g. after rewind).
   * Generates new random session IDs so the CLI starts a fresh session
   * instead of continuing the old on-disk session that still has rewound messages.
   */
  resetSessions(threadId: string, agentIds: string[]): void {
    for (const agentId of agentIds) {
      const k = this.key(threadId, agentId);
      const oldSessionId = this.getSessionId(threadId, agentId);
      this.usedSessions.delete(oldSessionId);
      this.killedSessions.add(oldSessionId);
      this.sessionOverrides.set(k, this.newSessionId());
    }
  }

  killAll(): void {
    for (const [, entry] of this.processes) {
      entry.killed = true;
      if (entry.idleTimer) { clearTimeout(entry.idleTimer); entry.idleTimer = undefined; }
      try {
        entry.process.kill("SIGTERM");
      } catch {
        // Ignore
      }
    }
    this.processes.clear();
  }

  getStatus(threadId: string, agentId: string): ThreadProcess {
    const k = this.key(threadId, agentId);
    const entry = this.processes.get(k);
    // A persistent Claude session that's alive but between turns reports "idle".
    // Non-persistent entries keep their real status (including "error").
    const status = !entry
      ? "idle"
      : entry.persistent && !this.isActive(entry)
        ? "idle"
        : entry.status;
    return {
      threadId,
      agentId,
      status,
      pid: entry?.process.pid,
    };
  }

  getProcess(threadId: string, agentId: string): ProcessEntry | null {
    return this.processes.get(this.key(threadId, agentId)) ?? null;
  }

  getAllStatuses(): ThreadProcess[] {
    // Only report entries that are actively producing a turn. Idle persistent
    // Claude sessions stay alive between turns but must not show as "running".
    return Array.from(this.processes.values())
      .filter((entry) => this.isActive(entry))
      .map((entry) => ({
        threadId: entry.threadId,
        agentId: entry.agentId,
        status: entry.status,
        pid: entry.process.pid,
      }));
  }
}

// Singleton via globalThis to survive HMR
const globalKey = Symbol.for("entourage-process-manager");

export function getProcessManager(): ProcessManager {
  const g = globalThis as unknown as Record<symbol, ProcessManager>;
  if (!g[globalKey]) {
    g[globalKey] = new ProcessManager();
    import("./workspace-store").then(({ loadWorkspaces }) =>
      loadWorkspaces().then((workspaces) =>
        import("./thread-store").then(({ recoverStaleStreams }) =>
          Promise.all(
            workspaces.map((ws) =>
              recoverStaleStreams(ws.directory).catch((err) => {
                console.error(`Failed to recover stale streams for ${ws.directory}:`, err);
              })
            )
          )
        )
      )
    );
    // Cleanup on exit
    process.on("exit", () => g[globalKey]?.killAll());
    process.on("SIGINT", () => {
      g[globalKey]?.killAll();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      g[globalKey]?.killAll();
      process.exit(0);
    });
  }
  return g[globalKey];
}
