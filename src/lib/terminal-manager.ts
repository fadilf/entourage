import type { IPty } from "node-pty";
import fs from "fs";
import os from "os";

// Use indirect require to prevent Turbopack from rewriting the module name
// with a hash suffix, which breaks resolution in global npm installs
const { spawn: ptySpawn } = eval('require')("node-pty") as typeof import("node-pty");

type TerminalSession = {
  id: string;
  pty: IPty;
  workspaceId: string;
  buffer: string[]; // Recent output chunks for re-attachment
  listeners: Set<(data: string) => void>;
};

const MAX_BUFFER_CHUNKS = 500;

class TerminalManager {
  private sessions = new Map<string, TerminalSession>();

  spawn(sessionId: string, workspaceId: string, cwd: string): TerminalSession {
    // Kill existing session with this ID
    this.kill(sessionId);

    const shell = process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "bash");

    // Fall back to home dir if cwd doesn't exist (e.g. deleted workspace)
    const safeCwd = fs.existsSync(cwd) ? cwd : os.homedir();

    const pty = ptySpawn(shell, ["--login"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: safeCwd,
      env: { ...process.env, COLORTERM: "truecolor" } as Record<string, string>,
    });

    const session: TerminalSession = {
      id: sessionId,
      pty,
      workspaceId,
      buffer: [],
      listeners: new Set(),
    };

    pty.onData((data: string) => {
      session.buffer.push(data);
      if (session.buffer.length > MAX_BUFFER_CHUNKS) {
        session.buffer.shift();
      }
      for (const listener of session.listeners) {
        listener(data);
      }
    });

    pty.onExit(() => {
      this.sessions.delete(sessionId);
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.pty.write(data);
    return true;
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.pty.resize(cols, rows);
    return true;
  }

  addListener(sessionId: string, listener: (data: string) => void): string[] | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.listeners.add(listener);
    // Return buffered output for re-attachment
    return session.buffer;
  }

  removeListener(sessionId: string, listener: (data: string) => void): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.listeners.delete(listener);
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.pty.kill();
    } catch {
      // Already dead
    }
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): TerminalSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getSessionsByWorkspace(workspaceId: string): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.workspaceId === workspaceId
    );
  }

  killByWorkspace(workspaceId: string): void {
    for (const session of this.getSessionsByWorkspace(workspaceId)) {
      this.kill(session.id);
    }
  }

  killAll(): void {
    for (const [, session] of this.sessions) {
      try {
        session.pty.kill();
      } catch {
        // Ignore
      }
    }
    this.sessions.clear();
  }
}

// Singleton via globalThis to survive HMR
const globalKey = Symbol.for("entourage-terminal-manager");

export function getTerminalManager(): TerminalManager {
  const g = globalThis as unknown as Record<symbol, TerminalManager>;
  if (!g[globalKey]) {
    g[globalKey] = new TerminalManager();
    process.on("exit", () => g[globalKey]?.killAll());
  }
  return g[globalKey];
}
