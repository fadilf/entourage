import { spawn as cpSpawn, ChildProcess } from "child_process";
import { getCliCommand } from "./config";
import { ThreadProcess, AgentModel, PermissionLevel } from "./types";
import crypto from "crypto";

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
};

const MAX_BUFFER_CHUNKS = 100;

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

/**
 * Check if a parsed JSON line indicates a resume failure.
 */
function isResumeError(json: Record<string, unknown>, model: AgentModel): boolean {
  // Claude/Gemini: result event with error flag
  if (json.type === "result" && json.is_error === true) return true;
  // Codex: turn.failed or stream-level error
  if (model === "codex" && (json.type === "turn.failed" || json.type === "error")) return true;
  return false;
}

/**
 * Check if a parsed JSON line indicates the session is alive (resume succeeded).
 */
function hasSuccessSignal(json: Record<string, unknown>, model: AgentModel): boolean {
  if (model === "codex") {
    // Codex: item events or turn.started mean the session is active
    const t = json.type as string;
    return t === "item.started" || t === "item.updated" || t === "item.completed" || t === "turn.started";
  }
  // Claude/Gemini: anything that's not a "result" event
  return json.type !== "result";
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

  spawn(
    threadId: string,
    agentId: string,
    model: AgentModel,
    cliModel: string | undefined,
    prompt: string,
    cwd: string,
    onData: (chunk: string) => void,
    onClose: (code: number | null) => void,
    onError: (err: Error) => void,
    hasHistory: boolean = false,
    personality?: string,
    imagePaths?: string[],
    fullHistoryPrompt?: string,
    permissionLevel: PermissionLevel = "full",
    threadPaths?: string[]
  ): ChildProcess {
    const k = this.key(threadId, agentId);

    // Kill existing process if any
    this.kill(threadId, agentId);

    const sessionId = this.getSessionId(threadId, agentId);
    const wasRewound = this.sessionOverrides.has(k);
    const isResume = (this.usedSessions.has(sessionId) || hasHistory) && !wasRewound;

    // After rewind, use full history prompt so the fresh session has full context
    const effectivePrompt = (!isResume && wasRewound && fullHistoryPrompt) ? fullHistoryPrompt : prompt;

    const { cmd, args } = getCliCommand(model, effectivePrompt, sessionId, isResume, personality, cliModel, imagePaths, permissionLevel, threadPaths);

    const child = cpSpawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    const entry: ProcessEntry = {
      process: child,
      threadId,
      agentId,
      model,
      status: "running",
      buffer: [],
      stderrBuffer: [],
      accumulatedContent: "",
      accumulatedBlocks: [],
    };
    this.processes.set(k, entry);

    // When resuming, defer onData until we confirm the session exists.
    // If --resume fails (error result), we retry with --session-id and discard error output.
    // Once we see a non-result line (e.g. system/init/assistant), flush and stream normally.
    let deferredChunks: string[] | null = isResume ? [] : null;

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      entry.buffer.push(chunk);
      if (entry.buffer.length > MAX_BUFFER_CHUNKS) {
        entry.buffer.shift();
      }

      if (deferredChunks) {
        // Check if this chunk contains a non-error line, meaning resume succeeded
        const hasNonErrorContent = chunk.split("\n").some((line) => {
          const trimmed = line.trim();
          if (!trimmed) return false;
          try {
            const json = JSON.parse(trimmed);
            return hasSuccessSignal(json, model);
          } catch {
            return model !== "codex"; // Non-JSON: real content for Claude, noise for Codex
          }
        });
        if (hasNonErrorContent) {
          // Resume succeeded — flush deferred chunks and switch to direct forwarding
          for (const deferred of deferredChunks) {
            onData(deferred);
          }
          deferredChunks = null;
          onData(chunk);
        } else {
          deferredChunks.push(chunk);
        }
      } else {
        onData(chunk);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      entry.stderrBuffer.push(chunk);
      if (entry.stderrBuffer.length > MAX_BUFFER_CHUNKS) {
        entry.stderrBuffer.shift();
      }
      // Don't forward stderr as content — it's collected for error reporting
    });

    child.on("error", (err) => {
      entry.status = "error";
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        onError(new Error(`CLI "${cmd}" not found. Make sure it is installed and in your PATH.`));
      } else {
        onError(err);
      }
    });

    child.on("close", (code) => {
      // Check if --resume produced only an error result (session not found).
      // The CLI may exit with code 0 but output an error JSON with is_error:true.
      const resumeFailedWithError = isResume && entry.buffer.length > 0 && (() => {
        const output = entry.buffer.join("").trim();
        try {
          const lastLine = output.split("\n").filter(l => l.trim()).pop() ?? "";
          const json = JSON.parse(lastLine);
          return isResumeError(json, model);
        } catch {
          return false;
        }
      })();

      if (code !== 0 || resumeFailedWithError) {
        // If --resume failed (no output or error result), the session likely doesn't exist.
        // Retry with --session-id to start a fresh CLI session.
        if (isResume && (entry.buffer.length === 0 || resumeFailedWithError)) {
          this.processes.delete(k);
          // Use full history prompt so the fresh session has conversation context
          const retryPrompt = fullHistoryPrompt || prompt;
          const fresh = getCliCommand(model, retryPrompt, sessionId, false, personality, cliModel, imagePaths, permissionLevel, threadPaths);
          const retryChild = cpSpawn(fresh.cmd, fresh.args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env },
          });
          const retryEntry: ProcessEntry = {
            process: retryChild,
            threadId,
            agentId,
            model,
            status: "running",
            buffer: [],
            stderrBuffer: [],
            accumulatedContent: "",
            accumulatedBlocks: [],
          };
          this.processes.set(k, retryEntry);

          retryChild.stdout?.on("data", (data: Buffer) => {
            const chunk = data.toString();
            retryEntry.buffer.push(chunk);
            if (retryEntry.buffer.length > MAX_BUFFER_CHUNKS) retryEntry.buffer.shift();
            onData(chunk);
          });
          retryChild.stderr?.on("data", (data: Buffer) => {
            const chunk = data.toString();
            retryEntry.stderrBuffer.push(chunk);
            if (retryEntry.stderrBuffer.length > MAX_BUFFER_CHUNKS) retryEntry.stderrBuffer.shift();
          });
          retryChild.on("error", (err) => {
            retryEntry.status = "error";
            onError(err);
          });
          retryChild.on("close", (retryCode) => {
            if (retryCode !== 0) {
              retryEntry.status = "error";
              if (retryEntry.stderrBuffer.length > 0) {
                const stderrText = retryEntry.stderrBuffer.join("").trim();
                if (stderrText) onError(new Error(summarizeStderr(stderrText)));
              }
            } else {
              this.killedSessions.delete(sessionId);
              this.sessionOverrides.delete(k);
              this.usedSessions.add(sessionId);
            }
            onClose(retryCode);
            this.processes.delete(k);
          });
          return;
        }

        entry.status = "error";
        // If process failed and we have stderr, report it as an error
        if (entry.stderrBuffer.length > 0) {
          const stderrText = entry.stderrBuffer.join("").trim();
          if (stderrText) {
            onError(new Error(summarizeStderr(stderrText)));
          }
        }
      } else {
        // Mark session as used so follow-ups use --resume
        this.killedSessions.delete(sessionId);
        this.sessionOverrides.delete(k);
        this.usedSessions.add(sessionId);
      }
      onClose(code);
      // Clean up after process exits
      this.processes.delete(k);
    });

    return child;
  }

  kill(threadId: string, agentId: string): void {
    const k = this.key(threadId, agentId);
    const entry = this.processes.get(k);
    if (!entry) return;

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

  isThreadStreaming(threadId: string): boolean {
    for (const [, entry] of this.processes) {
      if (entry.threadId === threadId && entry.status === "running") {
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
    return {
      threadId,
      agentId,
      status: entry?.status ?? "idle",
      pid: entry?.process.pid,
    };
  }

  getProcess(threadId: string, agentId: string): ProcessEntry | null {
    return this.processes.get(this.key(threadId, agentId)) ?? null;
  }

  getAllStatuses(): ThreadProcess[] {
    return Array.from(this.processes.values()).map((entry) => ({
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
