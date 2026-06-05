import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// --- Mocks (mirror process-manager.test.ts, plus the headless wakeup runner) ---

vi.mock("child_process", () => ({ spawn: vi.fn() }));

vi.mock("../config", () => ({
  getClaudeStreamArgs: vi.fn(() => ["--session-id", "sess"]),
  enrichPromptWithAttachments: vi.fn((p: string) => p),
  getCodexAcpConfigArgs: vi.fn(() => []),
}));

vi.mock("../workspace-store", () => ({ loadWorkspaces: vi.fn().mockResolvedValue([]) }));
vi.mock("../thread-store", () => ({ recoverStaleStreams: vi.fn().mockResolvedValue(undefined) }));

// The headless runner is invoked by the server-side wakeup timer. Mock it so we
// can assert it fires (and with which args) without spawning a real CLI.
const runWakeupTurn = vi.fn().mockResolvedValue(undefined);
vi.mock("../wakeup-runner", () => ({ runWakeupTurn }));

import { spawn as cpSpawn } from "child_process";
import { getProcessManager } from "../process-manager";

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

const globalKey = Symbol.for("entourage-process-manager");
function resetSingleton() {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[globalKey] as { killAll?: () => void } | undefined;
  if (existing?.killAll) existing.killAll();
  delete g[globalKey];
}

// scheduleWakeup fires WAKEUP_GRACE_MS (4s) after the requested delay so a
// connected tab can claim it first.
const GRACE = 4000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  resetSingleton();
});
afterEach(() => {
  resetSingleton();
  vi.useRealTimers();
});

describe("ProcessManager — ScheduleWakeup server-side timer", () => {
  it("fires the headless runner after delay + grace when nothing claims it (tab closed)", async () => {
    const pm = getProcessManager();
    const res = pm.scheduleWakeup("/ws", "t1", "a1", 60_000, "say PINGED");
    expect(res).toEqual({ fireAt: Date.now() + 60_000 + GRACE });

    // Before the deadline: not yet fired.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runWakeupTurn).not.toHaveBeenCalled();

    // After the grace window elapses with no client claim: fires headlessly.
    await vi.advanceTimersByTimeAsync(GRACE + 10);
    expect(runWakeupTurn).toHaveBeenCalledWith("/ws", "t1", "a1", "say PINGED");
  });

  it("a client claim cancels the timer so the server never double-fires", async () => {
    const pm = getProcessManager();
    pm.scheduleWakeup("/ws", "t1", "a1", 60_000, "continue");

    expect(pm.claimWakeup("t1", "a1")).toBe(true); // tab takes over
    expect(pm.claimWakeup("t1", "a1")).toBe(false); // nothing left to claim

    await vi.advanceTimersByTimeAsync(60_000 + GRACE + 10);
    expect(runWakeupTurn).not.toHaveBeenCalled();
  });

  it("cancelWakeup prevents the timer from firing", async () => {
    const pm = getProcessManager();
    pm.scheduleWakeup("/ws", "t1", "a1", 60_000, "continue");
    pm.cancelWakeup("t1", "a1");

    await vi.advanceTimersByTimeAsync(60_000 + GRACE + 10);
    expect(runWakeupTurn).not.toHaveBeenCalled();
  });

  it("skips the headless fire if the agent is already streaming (client beat the grace window)", async () => {
    const proc = createFakeProcess();
    mockedSpawn.mockReturnValue(proc as never);

    const pm = getProcessManager();
    // A live turn is in flight for this agent (e.g. the client claimed and started it).
    pm.startClaudeTurn("t1", "a1", undefined, "hi", "/ws", vi.fn(), vi.fn(), vi.fn());
    pm.scheduleWakeup("/ws", "t1", "a1", 60_000, "continue");

    await vi.advanceTimersByTimeAsync(60_000 + GRACE + 10);
    expect(runWakeupTurn).not.toHaveBeenCalled();
  });

  it("enforces the chained-wakeup backstop (caps at 20 consecutive)", () => {
    const pm = getProcessManager();
    for (let i = 0; i < 20; i++) {
      expect(pm.scheduleWakeup("/ws", "t1", "a1", 60_000, "go")).toHaveProperty("fireAt");
    }
    expect(pm.scheduleWakeup("/ws", "t1", "a1", 60_000, "go")).toEqual({ capped: true });
  });

  it("a real user message (cancelWakeup) resets the chain so wakeups can arm again", () => {
    const pm = getProcessManager();
    for (let i = 0; i < 20; i++) pm.scheduleWakeup("/ws", "t1", "a1", 60_000, "go");
    expect(pm.scheduleWakeup("/ws", "t1", "a1", 60_000, "go")).toEqual({ capped: true });

    pm.cancelWakeup("t1", "a1"); // user took over → chain reset
    expect(pm.scheduleWakeup("/ws", "t1", "a1", 60_000, "go")).toHaveProperty("fireAt");
  });

  it("only the latest schedule for a key is armed (replaces the prior timer)", async () => {
    const pm = getProcessManager();
    pm.scheduleWakeup("/ws", "t1", "a1", 60_000, "first");
    pm.scheduleWakeup("/ws", "t1", "a1", 120_000, "second");

    await vi.advanceTimersByTimeAsync(120_000 + GRACE + 10);
    expect(runWakeupTurn).toHaveBeenCalledTimes(1);
    expect(runWakeupTurn).toHaveBeenCalledWith("/ws", "t1", "a1", "second");
  });
});
