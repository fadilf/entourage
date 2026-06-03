import { spawn as cpSpawn, ChildProcess } from "child_process";
import { Readable, Writable } from "node:stream";
import type {
  Client,
  ClientSideConnection,
  ContentBlock,
  PermissionOption,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { PermissionLevel } from "./types";
import { getCodexAcpConfigArgs } from "./config";

// Current ACP protocol version (the SDK no longer exports a constant). The
// agent negotiates and echoes the supported version in the initialize response.
const ACP_PROTOCOL_VERSION = 1;

// Runtime require (bypasses the bundler) — mirrors the node-pty pattern used in
// terminal-manager.ts. Needed to resolve the platform-specific codex-acp binary.
const nodeRequire = eval("require") as NodeRequire;

// The ACP SDK is ESM-only; load it lazily via dynamic import so it isn't pulled
// into the bundle's module graph at build time.
type AcpModule = typeof import("@agentclientprotocol/sdk");
let acpModulePromise: Promise<AcpModule> | null = null;
function loadAcp(): Promise<AcpModule> {
  if (!acpModulePromise) acpModulePromise = import("@agentclientprotocol/sdk");
  return acpModulePromise;
}

/** Resolve the codex-acp binary, falling back to the JS launcher run via node. */
function resolveCodexAcp(): { cmd: string; preArgs: string[] } {
  const platform = process.platform;
  const arch = process.arch;
  const pkg = `@zed-industries/codex-acp-${platform}-${arch}`;
  const bin = platform === "win32" ? "codex-acp.exe" : "codex-acp";
  try {
    return { cmd: nodeRequire.resolve(`${pkg}/bin/${bin}`), preArgs: [] };
  } catch {
    const launcher = nodeRequire.resolve("@zed-industries/codex-acp/bin/codex-acp.js");
    return { cmd: process.execPath, preArgs: [launcher] };
  }
}

export type AcpConnectionOptions = {
  cwd: string;
  cliModel?: string;
  permissionLevel: PermissionLevel;
};

/**
 * A persistent ACP connection to a single codex-acp adapter process. Spawns the
 * adapter in the constructor (so `.child` is immediately available for the
 * ProcessManager to track), then `connect()` wires up the JSON-RPC stream.
 *
 * Handlers (`onSessionUpdate`, `onPermissionRequest`, `onStderr`, `onClose`,
 * `onError`) are assigned by the ProcessManager right after construction.
 */
export class AcpConnection {
  readonly child: ChildProcess;
  private conn: ClientSideConnection | null = null;
  private closed = false;
  private rejectClosed: ((err: Error) => void) | null = null;
  private readonly closedPromise: Promise<never>;

  onSessionUpdate?: (update: SessionNotification["update"]) => void;
  onPermissionRequest?: (options: PermissionOption[]) => string | null;
  onStderr?: (chunk: string) => void;
  onClose?: (code: number | null) => void;
  onError?: (err: Error) => void;

  constructor(private readonly opts: AcpConnectionOptions) {
    const { cmd, preArgs } = resolveCodexAcp();
    const args = [...preArgs, ...getCodexAcpConfigArgs(opts.cliModel, opts.permissionLevel)];
    this.child = cpSpawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      windowsHide: true,
    });

    this.closedPromise = new Promise<never>((_, reject) => {
      this.rejectClosed = reject;
    });
    // Avoid unhandled-rejection noise when no prompt is in flight at close time.
    this.closedPromise.catch(() => {});

    this.child.stderr?.on("data", (d: Buffer) => this.onStderr?.(d.toString()));
    this.child.on("error", (err) => {
      this.closed = true;
      this.rejectClosed?.(err);
      const message = (err as NodeJS.ErrnoException).code === "ENOENT"
        ? `codex-acp adapter not found. Reinstall dependencies (npm install).`
        : err.message;
      this.onError?.(new Error(message));
    });
    this.child.on("close", (code) => {
      this.closed = true;
      this.rejectClosed?.(new Error("codex-acp exited"));
      this.onClose?.(code);
    });
  }

  /** Establish the JSON-RPC stream over the adapter's stdio. */
  async connect(): Promise<void> {
    const acp = await loadAcp();
    const stream = acp.ndJsonStream(
      Writable.toWeb(this.child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(this.child.stdout!) as ReadableStream<Uint8Array>
    );
    const client: Client = {
      sessionUpdate: async (params) => {
        this.onSessionUpdate?.(params.update);
      },
      requestPermission: async (params) => {
        const optionId = this.onPermissionRequest?.(params.options) ?? null;
        return optionId
          ? { outcome: { outcome: "selected", optionId } }
          : { outcome: { outcome: "cancelled" } };
      },
      // fs/terminal capabilities are intentionally not advertised, so the adapter
      // performs file/command operations itself within Codex's sandbox.
    };
    this.conn = new acp.ClientSideConnection(() => client, stream);
  }

  async initialize(): Promise<void> {
    if (!this.conn) throw new Error("ACP connection not established");
    await this.conn.initialize({
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    });
  }

  /** Create a fresh session and return its id. */
  async newSession(): Promise<string> {
    if (!this.conn) throw new Error("ACP connection not established");
    const res = await this.conn.newSession({ cwd: this.opts.cwd, mcpServers: [] });
    return res.sessionId;
  }

  /** Run one prompt turn, resolving with the stop reason when it completes. */
  async prompt(sessionId: string, blocks: ContentBlock[]): Promise<string> {
    if (!this.conn) throw new Error("ACP connection not established");
    if (this.closed) throw new Error("codex-acp connection closed");
    const result = this.conn.prompt({ sessionId, prompt: blocks }).then((r) => r.stopReason);
    return Promise.race([result, this.closedPromise]);
  }

  /** Notify the adapter to cancel the in-flight turn (best-effort). */
  cancel(sessionId: string): void {
    if (!this.conn || this.closed) return;
    this.conn.cancel({ sessionId }).catch(() => {});
  }
}
