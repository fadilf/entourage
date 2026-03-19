"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { ThreadListItem, ThreadWithMessages, ThreadProcess, Agent, MessageImage, Workspace, Icon } from "@/lib/types";
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

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ThreadProcess[]>([]);
  const [unreadByThread, setUnreadByThread] = useState<Record<string, string[]>>({});
  const [showNewThread, setShowNewThread] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGitDialog, setShowGitDialog] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [enabledPlugins, setEnabledPlugins] = useState<string[]>([]);
  const [gitChangeCount, setGitChangeCount] = useState(0);
  const [gitIsRepo, setGitIsRepo] = useState(true);
  const streamCompleteThreadId = useRef<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionsAbortRef = useRef<AbortController | null>(null);

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
      })
      .catch(() => {});
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
  const [config, , refetchConfig] = useFetch<{ agents: Agent[]; displayName?: string }>(configUrl);
  const agents = config?.agents ?? [];
  const displayName = config?.displayName ?? "You";

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

  const fetchSuggestions = useCallback(async (threadId: string, workspaceId: string) => {
    suggestionsAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;

    setSuggestionsLoading(true);
    setSuggestions([]);

    try {
      const configRes = await fetch("/api/config", { signal: controller.signal });
      if (!configRes.ok) { setSuggestionsLoading(false); return; }
      const config = await configRes.json();
      if (!config.quickReplies?.enabled) { setSuggestionsLoading(false); return; }

      const res = await fetch(
        `/api/threads/${threadId}/suggestions?workspaceId=${workspaceId}`,
        { method: "POST", signal: controller.signal }
      );
      if (!res.ok) { setSuggestionsLoading(false); return; }
      const data = await res.json();
      if (!controller.signal.aborted) {
        setSuggestions(data.suggestions ?? []);
      }
    } catch {
      // AbortError or network error — ignore
    } finally {
      if (!controller.signal.aborted) {
        setSuggestionsLoading(false);
      }
    }
  }, []);

  const handleStreamComplete = useCallback(
    (completedThreadId: string) => {
      streamCompleteThreadId.current = completedThreadId;
      refetchThreads();
      // If the completed thread is currently selected, also refetch its messages
      if (completedThreadId === selectedThreadId) {
        refetchThread();
      }
      if (activeWorkspaceId) {
        fetchSuggestions(completedThreadId, activeWorkspaceId);
      }
    },
    [selectedThreadId, refetchThread, refetchThreads, activeWorkspaceId, fetchSuggestions]
  );

  const { streamingMessages, isStreaming, sendMessage, stopAgent, reattach } = useAgentStream(
    selectedThreadId,
    handleStreamComplete,
    activeWorkspaceId
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

  // Clear suggestions on thread switch
  useEffect(() => {
    suggestionsAbortRef.current?.abort();
    setSuggestions([]);
    setSuggestionsLoading(false);
  }, [selectedThreadId]);

  const handleDraftChange = useCallback((hasText: boolean) => {
    if (hasText) {
      suggestionsAbortRef.current?.abort();
      setSuggestions([]);
      setSuggestionsLoading(false);
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
  }, [fetchGitBadge]);

  const handlePluginClick = useCallback((pluginId: string) => {
    if (pluginId === "git") setShowGitDialog(true);
    if (pluginId === "files") setShowFileBrowser(true);
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

  const handleSendMessage = useCallback(
    async (content: string, images?: MessageImage[]) => {
      suggestionsAbortRef.current?.abort();
      setSuggestions([]);
      setSuggestionsLoading(false);
      if (!selectedThreadId || !selectedThread) return;

      const res = await fetch(wsUrl(`/api/threads/${selectedThreadId}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, ...(images && images.length > 0 ? { images } : {}) }),
      });

      if (!res.ok) return;

      const { message, targetAgents, threadUpdated } = await res.json();

      // Update local state immediately
      setSelectedThread((prev) =>
        prev ? { ...prev, messages: [...prev.messages, message] } : prev
      );

      // Refetch thread to pick up newly added agents
      if (threadUpdated) {
        refetchThread();
      }

      // Start streaming for target agents
      sendMessage(content, targetAgents, images);
    },
    [selectedThreadId, selectedThread, sendMessage, setSelectedThread, refetchThread, wsUrl]
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

  const handleRewind = useCallback(
    async (messageId: string) => {
      if (!selectedThreadId) return;
      const res = await fetch(wsUrl(`/api/threads/${selectedThreadId}/rewind`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setSelectedThread(updated);
      refetchThreads();
    },
    [selectedThreadId, setSelectedThread, refetchThreads, wsUrl]
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
      onOpenSettings={() => setShowSettings(true)}
      onArchiveThread={handleArchiveThread}
      statuses={statuses}
      unreadByThread={unreadByThread}
      isMobile={isMobile}
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
      isStreaming={isStreaming}
      allAgents={agents}
      displayName={displayName}
      isMobile={isMobile}
      onBack={isMobile ? () => setSelectedThreadId(null) : undefined}
      suggestions={suggestions}
      suggestionsLoading={suggestionsLoading}
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
    </div>
    </WorkspaceProvider>
  );
}
