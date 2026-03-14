import { spawn, ChildProcess } from "child_process";
import { getCliCommand } from "./config";
import { ThreadProcess, AgentModel } from "./types";
import crypto from "crypto";

type ProcessEntry = {
  process: ChildProcess;
  threadId: string;
  agentId: string;
  status: "running" | "error";
  buffer: string[]; // Recent stdout chunks for re-attachment
};

const MAX_BUFFER_CHUNKS = 100;

class ProcessManager {
  private processes = new Map<string, ProcessEntry>();
  private usedSessions = new Set<string>(); // Track sessions that have been used

  private key(threadId: string, agentId: string): string {
    return `${threadId}:${agentId}`;
  }

  private getSessionId(threadId: string, agentId: string): string {
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

  spawn(
    threadId: string,
    agentId: string,
    model: AgentModel,
    prompt: string,
    cwd: string,
    onData: (chunk: string) => void,
    onClose: (code: number | null) => void,
    onError: (err: Error) => void,
    hasHistory: boolean = false,
    personality?: string
  ): ChildProcess {
    const k = this.key(threadId, agentId);

    // Kill existing process if any
    this.kill(threadId, agentId);

    const sessionId = this.getSessionId(threadId, agentId);
    const isResume = this.usedSessions.has(sessionId) || hasHistory;

    const { cmd, args } = getCliCommand(model, prompt, sessionId, isResume, personality);

    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    const entry: ProcessEntry = {
      process: child,
      threadId,
      agentId,
      status: "running",
      buffer: [],
    };
    this.processes.set(k, entry);

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      entry.buffer.push(chunk);
      if (entry.buffer.length > MAX_BUFFER_CHUNKS) {
        entry.buffer.shift();
      }
      onData(chunk);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      entry.buffer.push(chunk);
      if (entry.buffer.length > MAX_BUFFER_CHUNKS) {
        entry.buffer.shift();
      }
      onData(chunk);
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
      if (code !== 0) {
        entry.status = "error";
      } else {
        // Mark session as used so follow-ups use --resume
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
const globalKey = Symbol.for("nexus-process-manager");

export function getProcessManager(): ProcessManager {
  const g = globalThis as unknown as Record<symbol, ProcessManager>;
  if (!g[globalKey]) {
    g[globalKey] = new ProcessManager();
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
