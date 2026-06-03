import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Shared registry + fake AcpConnection, created in a hoisted block so the
// vi.mock factory below can reference it.
const h = vi.hoisted(() => {
  // Minimal fake child: the ProcessManager only touches kill/pid/on/stdin.end.
  function createFakeProcess() {
    return {
      stdin: { end: vi.fn() },
      pid: Math.floor(Math.random() * 10000) + 1000,
      kill: vi.fn(),
      on: vi.fn(),
    };
  }

  type Resolver = { resolve: (stop: string) => void; reject: (e: Error) => void };

  const instances: FakeAcp[] = [];

  class FakeAcp {
    child = createFakeProcess();
    opts: { cwd: string; cliModel?: string; permissionLevel: string };
    onSessionUpdate?: (u: unknown) => void;
    onPermissionRequest?: (options: unknown[]) => string | null;
    onStderr?: (chunk: string) => void;
    onClose?: (code: number | null) => void;
    onError?: (err: Error) => void;
    pending: Resolver[] = [];
    connect = vi.fn().mockResolvedValue(undefined);
    initialize = vi.fn().mockResolvedValue(undefined);
    newSession = vi.fn().mockResolvedValue("acp-1");
    cancel = vi.fn();
    prompt = vi.fn(
      () => new Promise<string>((resolve, reject) => { this.pending.push({ resolve, reject }); })
    );

    constructor(opts: { cwd: string; cliModel?: string; permissionLevel: string }) {
      this.opts = opts;
      instances.push(this);
    }

    /** Resolve the oldest in-flight prompt() with a stop reason. */
    finishTurn(stop = "end_turn") {
      this.pending.shift()?.resolve(stop);
    }
  }

  return { FakeAcp, instances, createFakeProcess };
});

vi.mock("../acp-client", () => ({ AcpConnection: h.FakeAcp }));

// Prevent startup recovery side-effects.
vi.mock("../workspace-store", () => ({ loadWorkspaces: vi.fn().mockResolvedValue([]) }));
vi.mock("../thread-store", () => ({ recoverStaleStreams: vi.fn().mockResolvedValue(undefined) }));

import { getProcessManager } from "../process-manager";

const flush = () => new Promise((r) => setTimeout(r, 0));
const globalKey = Symbol.for("entourage-process-manager");

function resetSingleton() {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[globalKey] as { killAll?: () => void } | undefined;
  if (existing?.killAll) existing.killAll();
  delete g[globalKey];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.instances.length = 0;
  resetSingleton();
});
afterEach(resetSingleton);

describe("ProcessManager — Codex (ACP)", () => {
  it("cold-starts an adapter, runs a turn, and streams translated events", async () => {
    const pm = getProcessManager();
    const onEvents = vi.fn();
    const onTurnEnd = vi.fn();
    const onError = vi.fn();

    pm.startCodexTurn("t1", "a1", "gpt-5.4", "hello", "/tmp", onEvents, onTurnEnd, onError);
    await flush();

    const acp = h.instances[0];
    expect(acp).toBeTruthy();
    expect(acp.connect).toHaveBeenCalled();
    expect(acp.newSession).toHaveBeenCalled();
    expect(acp.prompt).toHaveBeenCalledTimes(1);

    // A streamed agent message chunk reaches the active turn as a content event.
    acp.onSessionUpdate?.({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi there" } });
    expect(onEvents).toHaveBeenCalledWith([{ type: "content", text: "hi there" }]);

    acp.finishTurn("end_turn");
    await flush();
    expect(onTurnEnd).toHaveBeenCalledWith("complete");
    expect(onError).not.toHaveBeenCalled();
  });

  it("queues a second message onto the live session (send-while-running)", async () => {
    const pm = getProcessManager();
    const firstEnd = vi.fn();
    const secondEnd = vi.fn();

    pm.startCodexTurn("t1", "a1", undefined, "first", "/tmp", vi.fn(), firstEnd, vi.fn());
    await flush();
    const acp = h.instances[0];
    expect(acp.prompt).toHaveBeenCalledTimes(1);

    // Second send while the first turn is still in flight — same adapter, queued.
    pm.startCodexTurn("t1", "a1", undefined, "second", "/tmp", vi.fn(), secondEnd, vi.fn());
    await flush();
    expect(h.instances).toHaveLength(1); // no new adapter spawned
    expect(acp.prompt).toHaveBeenCalledTimes(1); // second not started yet

    acp.finishTurn("end_turn");
    await flush();
    expect(firstEnd).toHaveBeenCalledWith("complete");
    expect(acp.prompt).toHaveBeenCalledTimes(2); // second now running

    acp.finishTurn("end_turn");
    await flush();
    expect(secondEnd).toHaveBeenCalledWith("complete");
  });

  it("reports streaming only while a turn is active", async () => {
    const pm = getProcessManager();
    pm.startCodexTurn("t1", "a1", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());
    await flush();
    expect(pm.isThreadStreaming("t1")).toBe(true);

    h.instances[0].finishTurn("end_turn");
    await flush();
    expect(pm.isThreadStreaming("t1")).toBe(false);
  });

  it("cancels the ACP session and kills the adapter on stop", async () => {
    const pm = getProcessManager();
    pm.startCodexTurn("t1", "a1", undefined, "hello", "/tmp", vi.fn(), vi.fn(), vi.fn());
    await flush();
    const acp = h.instances[0];

    pm.kill("t1", "a1");
    expect(acp.cancel).toHaveBeenCalledWith("acp-1");
    expect(acp.child.kill).toHaveBeenCalled();
    expect(pm.getProcess("t1", "a1")).toBeNull();
  });

  it("surfaces a thrown prompt as a turn error", async () => {
    const pm = getProcessManager();
    const onError = vi.fn();
    const onTurnEnd = vi.fn();
    pm.startCodexTurn("t1", "a1", undefined, "hello", "/tmp", vi.fn(), onTurnEnd, onError);
    await flush();

    h.instances[0].pending.shift()?.reject(new Error("boom"));
    await flush();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(onTurnEnd).not.toHaveBeenCalled();
  });
});
