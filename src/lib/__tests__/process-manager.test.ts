import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// --- Mocks ---

// Mock child_process.spawn to return controllable fake processes
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// Mock config to return predictable CLI commands
vi.mock("../config", () => ({
  getCliCommand: vi.fn(
    (
      _model: string,
      _prompt: string,
      _sessionId: string,
      isResume: boolean
    ) => ({
      cmd: "fake-cli",
      args: isResume ? ["--resume"] : ["--session-id"],
    })
  ),
}));

// Mock workspace-store and thread-store to prevent startup recovery
vi.mock("../workspace-store", () => ({
  loadWorkspaces: vi.fn().mockResolvedValue([]),
}));
vi.mock("../thread-store", () => ({
  recoverStaleStreams: vi.fn().mockResolvedValue(undefined),
}));

import { spawn as cpSpawn } from "child_process";
import { getCliCommand } from "../config";
import { getProcessManager } from "../process-manager";

// Helper to create a fake ChildProcess
function createFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = Math.floor(Math.random() * 10000) + 1000;
  proc.kill = vi.fn();
  return proc;
}

const mockedSpawn = vi.mocked(cpSpawn);
const mockedGetCliCommand = vi.mocked(getCliCommand);

// We need a fresh ProcessManager for each test. Since it's a globalThis singleton,
// we clear the symbol before each test.
const globalKey = Symbol.for("entourage-process-manager");

beforeEach(() => {
  vi.clearAllMocks();
  // Clear singleton so each test gets a fresh ProcessManager
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[globalKey] as { killAll?: () => void } | undefined;
  if (existing?.killAll) existing.killAll();
  delete g[globalKey];
});

afterEach(() => {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[globalKey] as { killAll?: () => void } | undefined;
  if (existing?.killAll) existing.killAll();
  delete g[globalKey];
});

describe("ProcessManager", () => {
  describe("spawn", () => {
    it("spawns a child process and forwards stdout to onData", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      const onData = vi.fn();
      const onClose = vi.fn();
      const onError = vi.fn();

      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", onData, onClose, onError);

      expect(mockedSpawn).toHaveBeenCalledWith(
        "fake-cli",
        expect.arrayContaining(["--session-id"]),
        expect.objectContaining({ cwd: "/tmp" })
      );

      // Simulate stdout data
      fakeProc.stdout.emit("data", Buffer.from("chunk1"));
      expect(onData).toHaveBeenCalledWith("chunk1");
    });

    it("reports ENOENT when CLI is not found", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      const onError = vi.fn();

      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), onError);

      const err = new Error("spawn fake-cli ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      fakeProc.emit("error", err);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("not found"),
        })
      );
    });

    it("calls onClose when process exits with code 0", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      const onClose = vi.fn();

      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), onClose, vi.fn());

      fakeProc.emit("close", 0);
      expect(onClose).toHaveBeenCalledWith(0);
    });

    it("reports stderr as error when process exits with non-zero code", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      const onError = vi.fn();
      const onClose = vi.fn();

      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), onClose, onError);

      fakeProc.stderr.emit("data", Buffer.from("Error: something broke\n"));
      fakeProc.emit("close", 1);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("something broke"),
        })
      );
      expect(onClose).toHaveBeenCalledWith(1);
    });

    it("kills existing process before spawning a new one for same thread+agent", () => {
      const fakeProc1 = createFakeProcess();
      const fakeProc2 = createFakeProcess();
      mockedSpawn.mockReturnValueOnce(fakeProc1 as never).mockReturnValueOnce(fakeProc2 as never);

      const pm = getProcessManager();

      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());
      pm.spawn("t1", "a1", "claude", undefined, "hello2", "/tmp", vi.fn(), vi.fn(), vi.fn());

      expect(fakeProc1.kill).toHaveBeenCalledWith("SIGTERM");
    });
  });

  describe("resume with deferred chunks", () => {
    it("defers stdout chunks during resume until success signal is seen", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      const onData = vi.fn();

      // hasHistory=true triggers resume mode
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", onData, vi.fn(), vi.fn(), true);

      // First chunk is a result (ambiguous) — should be deferred
      fakeProc.stdout.emit("data", Buffer.from('{"type":"result","is_error":false}\n'));
      expect(onData).not.toHaveBeenCalled();

      // Second chunk has actual content — should flush deferred + forward
      fakeProc.stdout.emit("data", Buffer.from('{"type":"assistant","content":"hi"}\n'));
      expect(onData).toHaveBeenCalledTimes(2); // deferred + current
    });

    it("retries with fresh session when resume fails with error result", () => {
      const resumeProc = createFakeProcess();
      const freshProc = createFakeProcess();
      mockedSpawn.mockReturnValueOnce(resumeProc as never).mockReturnValueOnce(freshProc as never);

      const pm = getProcessManager();
      const onData = vi.fn();
      const onClose = vi.fn();

      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", onData, onClose, vi.fn(), true);

      // Resume outputs an error result and exits
      resumeProc.stdout.emit("data", Buffer.from('{"type":"result","is_error":true}\n'));
      resumeProc.emit("close", 0);

      // Should have spawned a retry
      expect(mockedSpawn).toHaveBeenCalledTimes(2);
      // Second call should NOT be a resume
      expect(mockedGetCliCommand).toHaveBeenLastCalledWith(
        "claude",
        expect.any(String),
        expect.any(String),
        false, // isResume = false
        undefined,
        undefined,
        undefined,
        "full",
        undefined,
        undefined
      );

      // Fresh process sends data
      freshProc.stdout.emit("data", Buffer.from("fresh output"));
      expect(onData).toHaveBeenCalledWith("fresh output");

      // Fresh process closes
      freshProc.emit("close", 0);
      expect(onClose).toHaveBeenCalledWith(0);
    });

    it("retries when resume exits with non-zero and no output", () => {
      const resumeProc = createFakeProcess();
      const freshProc = createFakeProcess();
      mockedSpawn.mockReturnValueOnce(resumeProc as never).mockReturnValueOnce(freshProc as never);

      const pm = getProcessManager();
      const onClose = vi.fn();

      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), onClose, vi.fn(), true);

      // Resume exits with error, no stdout
      resumeProc.emit("close", 1);

      // Should retry with fresh session
      expect(mockedSpawn).toHaveBeenCalledTimes(2);
    });
  });

  describe("kill", () => {
    it("sends SIGTERM to the running process", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());

      pm.kill("t1", "a1");
      expect(fakeProc.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("does nothing for non-existent processes", () => {
      const pm = getProcessManager();
      // Should not throw
      pm.kill("nonexistent", "nonexistent");
    });
  });

  describe("killByThread", () => {
    it("kills all processes for a given thread", () => {
      const proc1 = createFakeProcess();
      const proc2 = createFakeProcess();
      const proc3 = createFakeProcess();
      mockedSpawn
        .mockReturnValueOnce(proc1 as never)
        .mockReturnValueOnce(proc2 as never)
        .mockReturnValueOnce(proc3 as never);

      const pm = getProcessManager();
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());
      pm.spawn("t1", "a2", "codex", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());
      pm.spawn("t2", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());

      pm.killByThread("t1");

      expect(proc1.kill).toHaveBeenCalledWith("SIGTERM");
      expect(proc2.kill).toHaveBeenCalledWith("SIGTERM");
      expect(proc3.kill).not.toHaveBeenCalled();
    });
  });

  describe("getStatus", () => {
    it("returns idle for unknown processes", () => {
      const pm = getProcessManager();
      const status = pm.getStatus("t1", "a1");
      expect(status).toEqual({
        threadId: "t1",
        agentId: "a1",
        status: "idle",
        pid: undefined,
      });
    });

    it("returns running for active processes", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());

      const status = pm.getStatus("t1", "a1");
      expect(status.status).toBe("running");
      expect(status.pid).toBe(fakeProc.pid);
    });

    it("returns error after process emits error", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());

      const err = new Error("boom") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      fakeProc.emit("error", err);

      const status = pm.getStatus("t1", "a1");
      expect(status.status).toBe("error");
    });
  });

  describe("isThreadStreaming", () => {
    it("returns false when no processes are running", () => {
      const pm = getProcessManager();
      expect(pm.isThreadStreaming("t1")).toBe(false);
    });

    it("returns true when a process is running for the thread", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());

      expect(pm.isThreadStreaming("t1")).toBe(true);
    });
  });

  describe("getAllStatuses", () => {
    it("returns statuses for all running processes", () => {
      const proc1 = createFakeProcess();
      const proc2 = createFakeProcess();
      mockedSpawn.mockReturnValueOnce(proc1 as never).mockReturnValueOnce(proc2 as never);

      const pm = getProcessManager();
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());
      pm.spawn("t2", "a2", "codex", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());

      const statuses = pm.getAllStatuses();
      expect(statuses).toHaveLength(2);
      expect(statuses.map((s: { threadId: string }) => s.threadId).sort()).toEqual(["t1", "t2"]);
    });
  });

  describe("getProcess", () => {
    it("returns null for unknown processes", () => {
      const pm = getProcessManager();
      expect(pm.getProcess("t1", "a1")).toBeNull();
    });

    it("returns the process entry for active processes", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());

      const entry = pm.getProcess("t1", "a1");
      expect(entry).not.toBeNull();
      expect(entry!.threadId).toBe("t1");
      expect(entry!.agentId).toBe("a1");
    });
  });

  describe("resetSessions", () => {
    it("causes next spawn to use a fresh session instead of resume", () => {
      const fakeProc1 = createFakeProcess();
      const fakeProc2 = createFakeProcess();
      mockedSpawn.mockReturnValueOnce(fakeProc1 as never).mockReturnValueOnce(fakeProc2 as never);

      const pm = getProcessManager();

      // First spawn — marks session as used
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());
      fakeProc1.emit("close", 0);

      // Reset sessions (simulating a rewind)
      pm.resetSessions("t1", ["a1"]);

      // Second spawn with hasHistory — should NOT resume due to reset
      pm.spawn("t1", "a1", "claude", undefined, "hello2", "/tmp", vi.fn(), vi.fn(), vi.fn(), true);

      // getCliCommand should have been called with isResume=false on the second call
      const lastCall = mockedGetCliCommand.mock.calls[mockedGetCliCommand.mock.calls.length - 1];
      expect(lastCall[3]).toBe(false); // isResume
    });
  });

  describe("killAll", () => {
    it("kills all running processes", () => {
      const proc1 = createFakeProcess();
      const proc2 = createFakeProcess();
      mockedSpawn.mockReturnValueOnce(proc1 as never).mockReturnValueOnce(proc2 as never);

      const pm = getProcessManager();
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());
      pm.spawn("t2", "a2", "codex", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());

      pm.killAll();

      expect(proc1.kill).toHaveBeenCalledWith("SIGTERM");
      expect(proc2.kill).toHaveBeenCalledWith("SIGTERM");
      expect(pm.getAllStatuses()).toHaveLength(0);
    });
  });

  describe("stderr buffering", () => {
    it("buffers stderr output without forwarding to onData", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      const onData = vi.fn();

      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", onData, vi.fn(), vi.fn());

      fakeProc.stderr.emit("data", Buffer.from("warning: something"));
      expect(onData).not.toHaveBeenCalled();
    });
  });

  describe("buffer management", () => {
    it("limits stdout buffer to MAX_BUFFER_CHUNKS", () => {
      const fakeProc = createFakeProcess();
      mockedSpawn.mockReturnValue(fakeProc as never);

      const pm = getProcessManager();
      pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());

      // Send 150 chunks (MAX_BUFFER_CHUNKS is 100)
      for (let i = 0; i < 150; i++) {
        fakeProc.stdout.emit("data", Buffer.from(`chunk-${i}`));
      }

      const entry = pm.getProcess("t1", "a1");
      expect(entry!.buffer.length).toBeLessThanOrEqual(100);
    });
  });
});

describe("summarizeStderr (via integration)", () => {
  it("extracts Error: pattern from stderr on non-zero exit", () => {
    const fakeProc = createFakeProcess();
    mockedSpawn.mockReturnValue(fakeProc as never);

    const pm = getProcessManager();
    const onError = vi.fn();

    pm.spawn("t1", "a1", "claude", undefined, "hello", "/tmp", vi.fn(), vi.fn(), onError);

    fakeProc.stderr.emit("data", Buffer.from("GaxiosError: Request failed with status 429\nsome stack trace"));
    fakeProc.emit("close", 1);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Request failed with status 429"),
      })
    );
  });
});
