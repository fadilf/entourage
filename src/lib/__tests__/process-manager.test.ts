import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// --- Mocks ---

vi.mock("child_process", () => ({ spawn: vi.fn() }));

// Persistent Claude turns use getClaudeStreamArgs + enrichPromptWithAttachments.
// getCodexAcpConfigArgs is imported transitively by acp-client.
vi.mock("../config", () => ({
  getClaudeStreamArgs: vi.fn(() => ["--session-id", "sess"]),
  enrichPromptWithAttachments: vi.fn((p: string) => p),
  getCodexAcpConfigArgs: vi.fn(() => []),
}));

vi.mock("../workspace-store", () => ({ loadWorkspaces: vi.fn().mockResolvedValue([]) }));
vi.mock("../thread-store", () => ({ recoverStaleStreams: vi.fn().mockResolvedValue(undefined) }));

import { spawn as cpSpawn } from "child_process";
import { getClaudeStreamArgs } from "../config";
import { getProcessManager } from "../process-manager";

// Fake ChildProcess for the persistent Claude session (stdin pipe + stdout/stderr).
function createFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; writable: boolean };
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdin = { write: vi.fn(), end: vi.fn(), writable: true };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = Math.floor(Math.random() * 10000) + 1000;
  proc.kill = vi.fn();
  return proc;
}

const mockedSpawn = vi.mocked(cpSpawn);
const mockedClaudeArgs = vi.mocked(getClaudeStreamArgs);

const globalKey = Symbol.for("entourage-process-manager");
function resetSingleton() {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[globalKey] as { killAll?: () => void } | undefined;
  if (existing?.killAll) existing.killAll();
  delete g[globalKey];
}

// A claude turn ends when a `result` line is seen on stdout.
const RESULT = JSON.stringify({ type: "result", is_error: false }) + "\n";

beforeEach(() => {
  vi.clearAllMocks();
  resetSingleton();
});
afterEach(resetSingleton);

function startTurn(
  pm: ReturnType<typeof getProcessManager>,
  threadId: string,
  agentId: string,
  handlers: { onData?: () => void; onTurnEnd?: () => void; onError?: () => void } = {},
  hasHistory = false
) {
  pm.startClaudeTurn(
    threadId, agentId, undefined, "hello", "/tmp",
    handlers.onData ?? vi.fn(),
    handlers.onTurnEnd ?? vi.fn(),
    handlers.onError ?? vi.fn(),
    hasHistory
  );
}

describe("ProcessManager — persistent Claude", () => {
  it("spawns claude with stdio pipes and writes the user message to stdin", () => {
    const proc = createFakeProcess();
    mockedSpawn.mockReturnValue(proc as never);

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1");

    expect(mockedSpawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--session-id"]),
      expect.objectContaining({ cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"] })
    );
    expect(proc.stdin.write).toHaveBeenCalled();
  });

  it("forwards stdout lines to onData", () => {
    const proc = createFakeProcess();
    mockedSpawn.mockReturnValue(proc as never);
    const onData = vi.fn();

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1", { onData });

    proc.stdout.emit("data", Buffer.from(JSON.stringify({ type: "assistant", message: { content: [] } }) + "\n"));
    expect(onData).toHaveBeenCalledWith(expect.stringContaining('"type":"assistant"'));
  });

  it("ends the turn on a result event", () => {
    const proc = createFakeProcess();
    mockedSpawn.mockReturnValue(proc as never);
    const onTurnEnd = vi.fn();

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1", { onTurnEnd });

    proc.stdout.emit("data", Buffer.from(RESULT));
    expect(onTurnEnd).toHaveBeenCalledWith("complete");
  });

  it("reports ENOENT as a friendly error", () => {
    const proc = createFakeProcess();
    mockedSpawn.mockReturnValue(proc as never);
    const onError = vi.fn();

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1", { onError });

    const err = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    proc.emit("error", err);

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("not found") }));
  });

  it("reports a stderr summary when the process exits non-zero", () => {
    const proc = createFakeProcess();
    mockedSpawn.mockReturnValue(proc as never);
    const onError = vi.fn();

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1", { onError });

    proc.stderr.emit("data", Buffer.from("Error: something broke\n"));
    proc.emit("close", 1);

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("something broke") }));
  });

  it("queues a follow-up onto the live session (send-while-running)", () => {
    const proc = createFakeProcess();
    mockedSpawn.mockReturnValue(proc as never);
    const firstEnd = vi.fn();
    const secondEnd = vi.fn();

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1", { onTurnEnd: firstEnd });
    startTurn(pm, "t1", "a1", { onTurnEnd: secondEnd }); // queued while first is active

    expect(mockedSpawn).toHaveBeenCalledTimes(1); // no second process
    expect(proc.stdin.write).toHaveBeenCalledTimes(2); // both messages written

    proc.stdout.emit("data", Buffer.from(RESULT));
    expect(firstEnd).toHaveBeenCalledWith("complete");
    proc.stdout.emit("data", Buffer.from(RESULT));
    expect(secondEnd).toHaveBeenCalledWith("complete");
  });

  describe("kill", () => {
    it("ends stdin and sends SIGTERM", () => {
      const proc = createFakeProcess();
      mockedSpawn.mockReturnValue(proc as never);

      const pm = getProcessManager();
      startTurn(pm, "t1", "a1");
      pm.kill("t1", "a1");

      expect(proc.stdin.end).toHaveBeenCalled();
      expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("does nothing for an unknown process", () => {
      const pm = getProcessManager();
      expect(() => pm.kill("nope", "nope")).not.toThrow();
    });
  });

  it("killByThread kills only the matching thread's processes", () => {
    const p1 = createFakeProcess();
    const p2 = createFakeProcess();
    mockedSpawn.mockReturnValueOnce(p1 as never).mockReturnValueOnce(p2 as never);

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1");
    startTurn(pm, "t2", "a1");

    pm.killByThread("t1");
    expect(p1.kill).toHaveBeenCalledWith("SIGTERM");
    expect(p2.kill).not.toHaveBeenCalled();
  });

  describe("getStatus", () => {
    it("returns idle for unknown processes", () => {
      const pm = getProcessManager();
      expect(pm.getStatus("t1", "a1")).toEqual({ threadId: "t1", agentId: "a1", status: "idle", pid: undefined });
    });

    it("is running during a turn and idle between turns", () => {
      const proc = createFakeProcess();
      mockedSpawn.mockReturnValue(proc as never);

      const pm = getProcessManager();
      startTurn(pm, "t1", "a1");
      expect(pm.getStatus("t1", "a1").status).toBe("running");

      proc.stdout.emit("data", Buffer.from(RESULT));
      expect(pm.getStatus("t1", "a1").status).toBe("idle"); // session alive, no active turn
    });
  });

  describe("isThreadStreaming", () => {
    it("is true during a turn and false after it ends", () => {
      const proc = createFakeProcess();
      mockedSpawn.mockReturnValue(proc as never);

      const pm = getProcessManager();
      startTurn(pm, "t1", "a1");
      expect(pm.isThreadStreaming("t1")).toBe(true);

      proc.stdout.emit("data", Buffer.from(RESULT));
      expect(pm.isThreadStreaming("t1")).toBe(false);
    });
  });

  it("getAllStatuses lists only actively streaming turns", () => {
    const p1 = createFakeProcess();
    const p2 = createFakeProcess();
    mockedSpawn.mockReturnValueOnce(p1 as never).mockReturnValueOnce(p2 as never);

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1");
    startTurn(pm, "t2", "a2");

    const statuses = pm.getAllStatuses();
    expect(statuses.map((s) => s.threadId).sort()).toEqual(["t1", "t2"]);
  });

  describe("getProcess", () => {
    it("returns null for unknown processes", () => {
      const pm = getProcessManager();
      expect(pm.getProcess("t1", "a1")).toBeNull();
    });

    it("returns the entry for a live session", () => {
      const proc = createFakeProcess();
      mockedSpawn.mockReturnValue(proc as never);

      const pm = getProcessManager();
      startTurn(pm, "t1", "a1");
      const entry = pm.getProcess("t1", "a1");
      expect(entry).not.toBeNull();
      expect(entry!.threadId).toBe("t1");
    });
  });

  it("resetSessions forces the next cold start to not resume", () => {
    const p1 = createFakeProcess();
    const p2 = createFakeProcess();
    mockedSpawn.mockReturnValueOnce(p1 as never).mockReturnValueOnce(p2 as never);

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1");
    p1.stdout.emit("data", Buffer.from(RESULT)); // turn completes → session marked used
    pm.kill("t1", "a1"); // drop the live session so the next turn cold-starts

    pm.resetSessions("t1", ["a1"]);
    startTurn(pm, "t1", "a1", {}, true); // hasHistory, but rewound → no resume

    const lastCall = mockedClaudeArgs.mock.calls[mockedClaudeArgs.mock.calls.length - 1];
    expect(lastCall[1]).toBe(false); // isResume
  });

  it("killAll terminates everything", () => {
    const p1 = createFakeProcess();
    const p2 = createFakeProcess();
    mockedSpawn.mockReturnValueOnce(p1 as never).mockReturnValueOnce(p2 as never);

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1");
    startTurn(pm, "t2", "a2");

    pm.killAll();
    expect(p1.kill).toHaveBeenCalledWith("SIGTERM");
    expect(p2.kill).toHaveBeenCalledWith("SIGTERM");
    expect(pm.getAllStatuses()).toHaveLength(0);
  });

  it("buffers stderr without forwarding it to onData", () => {
    const proc = createFakeProcess();
    mockedSpawn.mockReturnValue(proc as never);
    const onData = vi.fn();

    const pm = getProcessManager();
    startTurn(pm, "t1", "a1", { onData });

    proc.stderr.emit("data", Buffer.from("warning: noise"));
    expect(onData).not.toHaveBeenCalled();
  });
});
