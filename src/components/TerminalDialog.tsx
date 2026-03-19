"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal as TerminalIcon, Plus, X } from "lucide-react";
import Dialog from "./Dialog";
import "@xterm/xterm/css/xterm.css";

type TerminalTab = {
  id: string;
  sessionId: string;
  title: string;
};

export default function TerminalDialog({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
}) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const terminalRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const xtermInstances = useRef<Map<string, unknown>>(new Map());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const fitAddons = useRef<Map<string, unknown>>(new Map());
  const xtermModules = useRef<{ Terminal: unknown; FitAddon: unknown } | null>(null);

  const wsParam = workspaceId ? `?workspaceId=${workspaceId}` : "";

  // Dynamically load xterm modules (client-side only)
  const loadXterm = useCallback(async () => {
    if (xtermModules.current) return xtermModules.current;
    const [xtermMod, fitMod] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);
    xtermModules.current = {
      Terminal: xtermMod.Terminal,
      FitAddon: fitMod.FitAddon,
    };
    return xtermModules.current;
  }, []);

  const createTab = useCallback(async () => {
    if (!workspaceId) return;
    setError(null);

    try {
      const res = await fetch(`/api/terminal/spawn${wsParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to spawn terminal");
      const { sessionId } = await res.json();

      const tabId = sessionId;
      const tab: TerminalTab = {
        id: tabId,
        sessionId,
        title: `Terminal ${tabs.length + 1}`,
      };

      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tabId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, [workspaceId, wsParam, tabs.length]);

  const closeTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Kill the session
      fetch("/api/terminal/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: tab.sessionId }),
      }).catch(() => {});

      // Abort SSE stream
      abortControllers.current.get(tabId)?.abort();
      abortControllers.current.delete(tabId);

      // Dispose xterm
      const xterm = xtermInstances.current.get(tabId);
      if (xterm && typeof (xterm as { dispose: () => void }).dispose === "function") {
        (xterm as { dispose: () => void }).dispose();
      }
      xtermInstances.current.delete(tabId);
      fitAddons.current.delete(tabId);
      terminalRefs.current.delete(tabId);

      setTabs((prev) => prev.filter((t) => t.id !== tabId));
      setActiveTabId((prev) => {
        if (prev !== tabId) return prev;
        const remaining = tabs.filter((t) => t.id !== tabId);
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      });
    },
    [tabs]
  );

  // Initialize xterm for a tab when it becomes active and its container is mounted
  const initTerminal = useCallback(
    async (tabId: string, container: HTMLDivElement) => {
      if (xtermInstances.current.has(tabId)) return;

      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      const modules = await loadXterm();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const TerminalClass = modules.Terminal as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const FitAddonClass = modules.FitAddon as any;

      const fitAddon = new FitAddonClass();
      const xterm = new TerminalClass({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'Geist Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
        theme: {
          background: "#18181b", // zinc-900
          foreground: "#f4f4f5", // zinc-100
          cursor: "#a78bfa", // violet-400
          cursorAccent: "#18181b",
          selectionBackground: "#7c3aed40", // violet-600/25
          black: "#27272a",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#f4f4f5",
          brightBlack: "#52525b",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#facc15",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#22d3ee",
          brightWhite: "#ffffff",
        },
        allowProposedApi: true,
      });

      xterm.loadAddon(fitAddon);
      xterm.open(container);
      fitAddons.current.set(tabId, fitAddon);

      // Fit after a brief delay to ensure container is sized
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
        } catch {
          // Container might not be visible yet
        }
      });

      xtermInstances.current.set(tabId, xterm);

      // Send keystrokes to backend
      xterm.onData((data: string) => {
        fetch("/api/terminal/input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: tab.sessionId, data }),
        }).catch(() => {});
      });

      // Resize PTY when terminal resizes
      xterm.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        fetch("/api/terminal/resize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: tab.sessionId, cols, rows }),
        }).catch(() => {});
      });

      // Connect SSE stream for output
      const ac = new AbortController();
      abortControllers.current.set(tabId, ac);

      try {
        const res = await fetch(
          `/api/terminal/stream?sessionId=${tab.sessionId}`,
          { signal: ac.signal }
        );
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let partial = "";

        const read = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            partial += decoder.decode(value, { stream: true });

            const lines = partial.split("\n");
            partial = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (typeof data === "string") {
                    xterm.write(data);
                  } else if (data.error) {
                    xterm.write(`\r\n\x1b[31m${data.error}\x1b[0m\r\n`);
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }
        };
        read().catch(() => {});
      } catch {
        // Aborted or failed
      }

      // Send initial resize
      const { cols, rows } = xterm;
      fetch("/api/terminal/resize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: tab.sessionId, cols, rows }),
      }).catch(() => {});
    },
    [tabs, loadXterm]
  );

  // Set ref callback for terminal container
  const setTerminalRef = useCallback(
    (tabId: string, el: HTMLDivElement | null) => {
      if (el) {
        terminalRefs.current.set(tabId, el);
        if (tabId === activeTabId) {
          initTerminal(tabId, el);
        }
      }
    },
    [activeTabId, initTerminal]
  );

  // Auto-create first tab when dialog opens
  useEffect(() => {
    if (open && tabs.length === 0) {
      createTab();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Handle resize when dialog opens or active tab changes
  useEffect(() => {
    if (!open || !activeTabId) return;

    const fitAddon = fitAddons.current.get(activeTabId);
    if (fitAddon && typeof (fitAddon as { fit: () => void }).fit === "function") {
      requestAnimationFrame(() => {
        try {
          (fitAddon as { fit: () => void }).fit();
        } catch {
          // Not visible yet
        }
      });
    }

    // Also focus the terminal
    const xterm = xtermInstances.current.get(activeTabId);
    if (xterm && typeof (xterm as { focus: () => void }).focus === "function") {
      requestAnimationFrame(() => {
        (xterm as { focus: () => void }).focus();
      });
    }
  }, [open, activeTabId]);

  // Resize observer for terminal container
  useEffect(() => {
    if (!open || !activeTabId) return;

    const container = terminalRefs.current.get(activeTabId);
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const fitAddon = fitAddons.current.get(activeTabId);
      if (fitAddon && typeof (fitAddon as { fit: () => void }).fit === "function") {
        try {
          (fitAddon as { fit: () => void }).fit();
        } catch {
          // Ignore
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [open, activeTabId]);

  // Clean up all terminals when dialog closes
  const handleClose = useCallback(() => {
    for (const tab of tabs) {
      fetch("/api/terminal/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: tab.sessionId }),
      }).catch(() => {});

      abortControllers.current.get(tab.id)?.abort();
      const xterm = xtermInstances.current.get(tab.id);
      if (xterm && typeof (xterm as { dispose: () => void }).dispose === "function") {
        (xterm as { dispose: () => void }).dispose();
      }
    }
    abortControllers.current.clear();
    xtermInstances.current.clear();
    fitAddons.current.clear();
    terminalRefs.current.clear();
    setTabs([]);
    setActiveTabId(null);
    onClose();
  }, [tabs, onClose]);

  return (
    <Dialog open={open} onClose={handleClose}>
      <div
        className="flex w-full max-w-5xl flex-col rounded-xl bg-zinc-900 shadow-xl mx-4"
        style={{ height: "75vh", maxHeight: 700 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with tabs */}
        <div className="flex items-center border-b border-zinc-700 pl-4 pr-2">
          <TerminalIcon className="h-4 w-4 text-violet-400 shrink-0 mr-2" />

          {/* Tab bar */}
          <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto py-1">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                  tab.id === activeTabId
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className="truncate max-w-24">{tab.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              onClick={createTab}
              className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
              title="New terminal"
            >
              <Plus size={14} />
            </button>
          </div>

          <button
            onClick={handleClose}
            className="text-zinc-500 hover:text-zinc-300 text-xl leading-none ml-2 p-1"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-400 border border-red-800">
            {error}
          </div>
        )}

        {/* Terminal content */}
        <div className="flex-1 min-h-0 relative">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              ref={(el) => setTerminalRef(tab.id, el)}
              className={`absolute inset-0 p-1 ${
                tab.id === activeTabId ? "block" : "hidden"
              }`}
            />
          ))}
          {tabs.length === 0 && (
            <div className="flex items-center justify-center h-full text-zinc-500">
              No terminal sessions
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
