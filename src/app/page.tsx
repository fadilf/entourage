"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { ThreadListItem, ThreadWithMessages, ThreadProcess, Agent, Message, MessageImage, Workspace, Icon } from "@/lib/types";
import { useAgentStream } from "@/hooks/useSSE";
import { useIsMobile } from "@/hooks/useIsMobile";
import ThreadList from "@/components/ThreadList";
import ThreadDetail from "@/components/ThreadDetail";
import NewThreadDialog from "@/components/NewThreadDialog";
import SettingsDialog from "@/components/SettingsDialog";
import WorkspaceBar from "@/components/WorkspaceBar";
import AddWorkspaceDialog from "@/components/AddWorkspaceDialog";
import GitDialog from "@/components/GitDialog";
import FileBrowserDialog from "@/components/FileBrowserDialog";
import TerminalDialog from "@/components/TerminalDialog";
import MobileMenuDrawer from "@/components/MobileMenuDrawer";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { PLUGINS } from "@/lib/plugins";

function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      setError(null);
      return;
    }
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setError(null);
    fetch(url, { signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((d) => { if (!ac.signal.aborted) setData(d); })
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  const refetch = useCallback(() => {
    if (!url) return;
    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch((err) => {
        if (err instanceof Error) setError(err.message);
      });
  }, [url]);

  return [data, setData, refetch, error] as const;
}

export default function Home() {
  const isMobile = useIsMobile();

  // Workspace state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [showAddWorkspace, setShowAddWorkspace] = useState(false);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ThreadProcess[]>([]);
  const [unreadByThread, setUnreadByThread] = useState<Record<string, string[]>>({});
  const [showNewThread, setShowNewThread] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGitDialog, setShowGitDialog] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [enabledPlugins, setEnabledPlugins] = useState<string[]>([]);
  const [gitChangeCount, setGitChangeCount] = useState(0);
  const [gitIsRepo, setGitIsRepo] = useState(true);
  const streamCompleteThreadId = useRef<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Resizable sidebar
  const SIDEBAR_MIN = 240;
  const SIDEBAR_MAX = 600;
  const SIDEBAR_DEFAULT = 320;
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const isResizing = useRef(false);

  // Helper to build workspace-aware API URLs
  const wsUrl = useCallback(
    (path: string) => {
      if (!activeWorkspaceId) return path;
      const separator = path.includes("?") ? "&" : "?";
      return `${path}${separator}workspaceId=${activeWorkspaceId}`;
    },
    [activeWorkspaceId]
  );

  // Load workspaces on mount
  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((ws: Workspace[]) => {
        setWorkspaces(ws);
        // Restore from localStorage or use first
        const saved = localStorage.getItem("entourage-active-workspace");
        const match = ws.find((w) => w.id === saved);
        setActiveWorkspaceId(match ? match.id : ws[0]?.id ?? null);
        setWorkspacesLoaded(true);
      })
      .catch(() => { setWorkspacesLoaded(true); });
  }, []);

  // Persist active workspace
  useEffect(() => {
    if (activeWorkspaceId) {
      localStorage.setItem("entourage-active-workspace", activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  useLayoutEffect(() => {
    const saved = localStorage.getItem("entourage-sidebar-width");
    if (saved) setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Number(saved))));
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + e.clientX - startX));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebarWidth]);

  // Persist sidebar width
  useEffect(() => {
    localStorage.setItem("entourage-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  const configUrl = "/api/config";
  const [config, , refetchConfig] = useFetch<{ agents: Agent[]; displayName?: string; quickReplies?: { enabled: boolean } }>(configUrl);
  const agents = config?.agents ?? [];
  const displayName = config?.displayName ?? "You";
  const quickRepliesEnabled = config?.quickReplies?.enabled ?? false;

  useEffect(() => {
    if (!config) return;
    const plugins = (config as Record<string, unknown>).plugins as Record<string, boolean> | undefined;
    const enabled = PLUGINS
      .filter((p) => plugins?.[p.id] ?? p.enabledByDefault)
      .map((p) => p.id);
    setEnabledPlugins(enabled);
  }, [config]);

  const threadsUrl = activeWorkspaceId ? wsUrl("/api/threads") : null;
  const [threads, , refetchThreads] = useFetch<ThreadListItem[]>(threadsUrl);
  const threadList = threads ?? [];

  const threadUrl = selectedThreadId ? wsUrl(`/api/threads/${selectedThreadId}`) : null;
  const [selectedThread, setSelectedThread, refetchThread] = useFetch<ThreadWithMessages>(threadUrl);

  const handleInlineSuggestions = useCallback((inlineSuggestions: string[]) => {
    if (inlineSuggestions.length > 0) {
      setSuggestions(inlineSuggestions);
    }
  }, []);

  const handleStreamComplete = useCallback(
    (completedThreadId: string) => {
      streamCompleteThreadId.current = completedThreadId;
      refetchThreads();
      if (completedThreadId === selectedThreadId) {
        refetchThread();
      }
    },
    [selectedThreadId, refetchThread, refetchThreads]
  );

  const { streamingMessages, isStreaming, sendMessage, stopAgent, reattach } = useAgentStream(
    selectedThreadId,
    handleStreamComplete,
    activeWorkspaceId,
    handleInlineSuggestions
  );

  // When switching to a thread that just completed streaming, refetch its data
  useEffect(() => {
    if (
      streamCompleteThreadId.current &&
      streamCompleteThreadId.current === selectedThreadId
    ) {
      streamCompleteThreadId.current = null;
      refetchThread();
    }
  }, [selectedThreadId, refetchThread]);

  // Auto re-attach to streams that were in progress when we navigated away
  useEffect(() => {
    if (!selectedThread) return;

    const pendingStreams = selectedThread.messages.filter(
      (m) => m.status === "streaming" && m.agentId
    );

    for (const msg of pendingStreams) {
      reattach(selectedThread.id, msg.agentId!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThread?.id, reattach]);

  // Restore persisted suggestions once when a thread first loads
  const lastRestoredThreadId = useRef<string | null>(null);

  // Clear suggestions on thread switch
  useEffect(() => {
    setSuggestions([]);
    lastRestoredThreadId.current = null;
  }, [selectedThreadId]);
  useEffect(() => {
    if (!selectedThread || lastRestoredThreadId.current === selectedThread.id) return;
    lastRestoredThreadId.current = selectedThread.id;
    const lastAssistant = [...selectedThread.messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.status === "complete");
    const persisted = lastAssistant?.suggestions ?? [];
    if (persisted.length > 0) {
      setSuggestions(persisted);
    }
  }, [selectedThread]);

  // Update document title with workspace name
  const activeWorkspaceName = workspaces.find(w => w.id === activeWorkspaceId)?.name;
  useEffect(() => {
    document.title = activeWorkspaceName ? `${activeWorkspaceName} | Entourage` : "Entourage";
  }, [activeWorkspaceName]);

  const handleDraftChange = useCallback((hasText: boolean) => {
    if (hasText) {
      setSuggestions((prev) => (prev.length === 0 ? prev : []));
    }
  }, []);

  // Clear unread indicators when opening a thread
  useEffect(() => {
    if (!selectedThreadId) return;
    fetch(wsUrl(`/api/threads/${selectedThreadId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearUnread: true }),
    }).catch(() => {});
  }, [selectedThreadId, wsUrl]);

  // Poll statuses
  useEffect(() => {
    if (!activeWorkspaceId) return;
    const poll = () => {
      fetch(wsUrl("/api/threads/status"))
        .then((r) => r.json())
        .then((data) => {
          setStatuses(data.statuses ?? data);
          setUnreadByThread(data.unreadByThread ?? {});
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [activeWorkspaceId, wsUrl]);

  // Switch workspace handler
  const handleSelectWorkspace = useCallback((id: string) => {
    if (id === activeWorkspaceId) return;
    setActiveWorkspaceId(id);
    setSelectedThreadId(null);
  }, [activeWorkspaceId]);

  const fetchGitBadge = useCallback(async () => {
    if (!activeWorkspaceId || !enabledPlugins.includes("git")) {
      setGitChangeCount(0);
      return;
    }
    try {
      const res = await fetch(wsUrl("/api/git/status"));
      if (!res.ok) return;
      const data = await res.json();
      setGitIsRepo(data.isRepo);
      setGitChangeCount(data.staged.length + data.unstaged.length);
    } catch {
      setGitIsRepo(false);
    }
  }, [activeWorkspaceId, enabledPlugins, wsUrl]);

  useEffect(() => {
    fetchGitBadge();
    const interval = setInterval(fetchGitBadge, 5000);
    return () => clearInterval(interval);
  }, [fetchGitBadge]);

  const handlePluginClick = useCallback((pluginId: string) => {
    if (pluginId === "git") setShowGitDialog(true);
    if (pluginId === "files") setShowFileBrowser(true);
    if (pluginId === "terminal") setShowTerminal(true);
  }, []);

  const handleRemoveWorkspace = useCallback(
    async (id: string) => {
      await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
      setWorkspaces((prev) => {
        const next = prev.filter((w) => w.id !== id);
        if (activeWorkspaceId === id) {
          setActiveWorkspaceId(next.length > 0 ? next[0].id : null);
          setSelectedThreadId(null);
        }
        return next;
      });
    },
    [activeWorkspaceId]
  );

  const handleEditWorkspace = useCallback(
    async (id: string, updates: { name?: string; color?: string; icon?: Icon | null }) => {
      const res = await fetch(`/api/workspaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? updated : w)));
    },
    []
  );

  const handleReorderWorkspaces = useCallback(
    async (orderedIds: string[]) => {
      // Optimistic update
      setWorkspaces((prev) => {
        const map = new Map(prev.map((w) => [w.id, w]));
        return orderedIds.map((id) => map.get(id)).filter(Boolean) as Workspace[];
      });
      await fetch("/api/workspaces/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
    },
    []
  );

  const sendUserMessage = useCallback(
    async (content: string, images?: MessageImage[]) => {
      if (!selectedThreadId) return false;

      const res = await fetch(wsUrl(`/api/threads/${selectedThreadId}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, ...(images && images.length > 0 ? { images } : {}) }),
      });

      if (!res.ok) return false;

      const { message, targetAgents, threadUpdated, thread } = await res.json();

      // Update local state immediately
      setSelectedThread((prev) =>
        prev
          ? {
              ...prev,
              messages: [...prev.messages, message],
              agents: thread?.agents ?? prev.agents,
              updatedAt: thread?.updatedAt ?? prev.updatedAt,
            }
          : prev
      );

      if (threadUpdated) {
        refetchThreads();
      }

      // Start streaming for target agents
      sendMessage(content, targetAgents, images);
      return true;
    },
    [selectedThreadId, sendMessage, setSelectedThread, refetchThreads, wsUrl]
  );

  const handleSendMessage = useCallback(
    async (content: string, images?: MessageImage[]) => {
      setSuggestions([]);
      await sendUserMessage(content, images);
    },
    [sendUserMessage]
  );

  const handleRenameThread = useCallback(
    async (title: string) => {
      if (!selectedThreadId) return;
      const res = await fetch(wsUrl(`/api/threads/${selectedThreadId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setSelectedThread((prev) => (prev ? { ...prev, title: updated.title } : prev));
      refetchThreads();
    },
    [selectedThreadId, setSelectedThread, refetchThreads, wsUrl]
  );

  const handleArchiveThread = useCallback(
    async (threadId: string, archived: boolean) => {
      const res = await fetch(wsUrl(`/api/threads/${threadId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) return;
      refetchThreads();
      if (archived && selectedThreadId === threadId) {
        setSelectedThreadId(null);
      }
    },
    [refetchThreads, selectedThreadId, wsUrl]
  );

  const rewindThread = useCallback(
    async (messageId: string, keepMessage = true, revertCode = false) => {
      if (!selectedThreadId) return;
      const res = await fetch(wsUrl(`/api/threads/${selectedThreadId}/rewind`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, keepMessage, revertCode }),
      });
      if (!res.ok) return null;
      const updated = await res.json();
      setSelectedThread(updated);
      refetchThreads();
      return updated as ThreadWithMessages;
    },
    [selectedThreadId, setSelectedThread, refetchThreads, wsUrl]
  );

  const handleRewind = useCallback(
    async (messageId: string, options?: { keepMessage?: boolean; revertCode?: boolean }) => {
      await rewindThread(messageId, options?.keepMessage ?? true, options?.revertCode ?? false);
    },
    [rewindThread]
  );

  const handleResendMessage = useCallback(
    async (message: Message) => {
      if (message.role !== "user") return;

      setSuggestions([]);

      const rewound = await rewindThread(message.id, false);
      if (!rewound) return;

      await sendUserMessage(message.content, message.images);
    },
    [rewindThread, sendUserMessage]
  );

  const handleThreadCreated = useCallback(
    (thread: ThreadWithMessages) => {
      refetchThreads();
      setSelectedThreadId(thread.id);
    },
    [refetchThreads]
  );

  const threadListEl = (
    <ThreadList
      threads={threadList}
      selectedThreadId={selectedThreadId}
      onSelectThread={setSelectedThreadId}
      onNewThread={() => setShowNewThread(true)}
      onOpenMenu={() => setShowMobileMenu(true)}
      onArchiveThread={handleArchiveThread}
      statuses={statuses}
      unreadByThread={unreadByThread}
      isMobile={isMobile}
      workspaceName={activeWorkspaceName}
    />
  );

  const threadDetailEl = (
    <ThreadDetail
      thread={selectedThread}
      streamingMessages={streamingMessages}
      onSendMessage={handleSendMessage}
      onStop={stopAgent}
      onRenameThread={handleRenameThread}
      onRewind={handleRewind}
      onResendMessage={handleResendMessage}
      isStreaming={isStreaming}
      allAgents={agents}
      displayName={displayName}
      isMobile={isMobile}
      onBack={isMobile ? () => setSelectedThreadId(null) : undefined}
      suggestions={quickRepliesEnabled ? suggestions : []}
      onSuggestionSelect={(text: string) => {
        setSuggestions([]);
        handleSendMessage(text);
      }}
      onDraftChange={handleDraftChange}
    />
  );

  const handleWorkspaceAdded = useCallback((ws: Workspace) => {
    setWorkspaces((prev) => [...prev, ws]);
    setActiveWorkspaceId(ws.id);
    setSelectedThreadId(null);
    setShowAddWorkspace(false);
  }, []);

  if (!workspacesLoaded) {
    return (
      <div className="flex h-dvh overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
        {/* Mobile skeleton */}
        <div className="flex flex-col w-full animate-pulse md:hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-5 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
          </div>
          <div className="flex flex-col gap-2 p-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
                <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 rounded bg-zinc-200 dark:bg-zinc-700" style={{ width: `${60 + (i % 3) * 15}%` }} />
                  <div className="h-3 rounded bg-zinc-100 dark:bg-zinc-800" style={{ width: `${40 + (i % 4) * 10}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Desktop skeleton */}
        <div className="hidden md:contents">
          <div className="flex flex-col items-center gap-2 py-3 px-2 border-r border-zinc-200 dark:border-zinc-800 w-16 shrink-0 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-700" />
            ))}
          </div>
          <div className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 animate-pulse" style={{ width: SIDEBAR_DEFAULT }}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="h-5 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
            <div className="flex flex-col gap-2 p-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 rounded bg-zinc-200 dark:bg-zinc-700" style={{ width: `${60 + (i % 3) * 15}%` }} />
                    <div className="h-3 rounded bg-zinc-100 dark:bg-zinc-800" style={{ width: `${40 + (i % 4) * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="h-4 w-48 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="flex h-dvh overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
        <AddWorkspaceDialog
          open
          inline
          onClose={() => {}}
          onAdded={handleWorkspaceAdded}
        />
      </div>
    );
  }

  return (
    <WorkspaceProvider workspaceId={activeWorkspaceId}>
    <div className="flex h-dvh overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
      {isMobile ? (
        selectedThreadId ? threadDetailEl : threadListEl
      ) : (
        <>
          <WorkspaceBar
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSelectWorkspace={handleSelectWorkspace}
            onAddWorkspace={() => setShowAddWorkspace(true)}
            onRemoveWorkspace={handleRemoveWorkspace}
            onEditWorkspace={handleEditWorkspace}
            onReorderWorkspaces={handleReorderWorkspaces}
            onOpenSettings={() => setShowSettings(true)}
            enabledPlugins={enabledPlugins}
            onPluginClick={handlePluginClick}
            gitChangeCount={gitChangeCount}
            gitIsRepo={gitIsRepo}
          />
          <div className="relative flex-shrink-0" style={{ width: sidebarWidth }}>
            {threadListEl}
            <div
              onMouseDown={startResize}
              className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-violet-400/40 active:bg-violet-400/60 transition-colors"
            />
          </div>
          {threadDetailEl}
        </>
      )}
      <NewThreadDialog
        open={showNewThread}
        agents={agents}
        onClose={() => setShowNewThread(false)}
        onCreated={handleThreadCreated}
        workspaceId={activeWorkspaceId}
      />
      <SettingsDialog
        open={showSettings}
        onClose={() => {
          setShowSettings(false);
          refetchConfig();
        }}
      />
      <AddWorkspaceDialog
        open={showAddWorkspace}
        onClose={() => setShowAddWorkspace(false)}
        onAdded={handleWorkspaceAdded}
      />
      <GitDialog
        open={showGitDialog}
        onClose={() => {
          setShowGitDialog(false);
          fetchGitBadge();
        }}
        workspaceId={activeWorkspaceId}
      />
      <FileBrowserDialog
        open={showFileBrowser}
        onClose={() => setShowFileBrowser(false)}
        workspaceId={activeWorkspaceId}
      />
      <TerminalDialog
        open={showTerminal}
        onClose={() => setShowTerminal(false)}
        workspaceId={activeWorkspaceId}
      />
      {isMobile && (
        <MobileMenuDrawer
          open={showMobileMenu}
          onClose={() => setShowMobileMenu(false)}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={handleSelectWorkspace}
          onAddWorkspace={() => setShowAddWorkspace(true)}
          onOpenSettings={() => setShowSettings(true)}
          enabledPlugins={enabledPlugins}
          onPluginClick={handlePluginClick}
          gitChangeCount={gitChangeCount}
          gitIsRepo={gitIsRepo}
        />
      )}
    </div>
    </WorkspaceProvider>
  );
}
