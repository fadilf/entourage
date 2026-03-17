"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { ThreadListItem, ThreadWithMessages, ThreadProcess, Agent, MessageImage, Workspace } from "@/lib/types";
import { useAgentStream } from "@/hooks/useSSE";
import { useIsMobile } from "@/hooks/useIsMobile";
import ThreadList from "@/components/ThreadList";
import ThreadDetail from "@/components/ThreadDetail";
import NewThreadDialog from "@/components/NewThreadDialog";
import SettingsDialog from "@/components/SettingsDialog";
import WorkspaceBar from "@/components/WorkspaceBar";
import AddWorkspaceDialog from "@/components/AddWorkspaceDialog";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";

function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    fetch(url, { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => { if (!ac.signal.aborted) setData(d); })
      .catch(() => {});
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  const refetch = useCallback(() => {
    if (!url) return;
    fetch(url)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [url]);

  return [data, setData, refetch] as const;
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
  const streamCompleteThreadId = useRef<string | null>(null);

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

  const configUrl = activeWorkspaceId ? wsUrl("/api/config") : null;
  const [config, , refetchConfig] = useFetch<{ agents: Agent[]; displayName?: string }>(configUrl);
  const agents = config?.agents ?? [];
  const displayName = config?.displayName ?? "You";

  const threadsUrl = activeWorkspaceId ? wsUrl("/api/threads") : null;
  const [threads, , refetchThreads] = useFetch<ThreadListItem[]>(threadsUrl);
  const threadList = threads ?? [];

  const threadUrl = selectedThreadId ? wsUrl(`/api/threads/${selectedThreadId}`) : null;
  const [selectedThread, setSelectedThread, refetchThread] = useFetch<ThreadWithMessages>(threadUrl);

  const handleStreamComplete = useCallback(
    (completedThreadId: string) => {
      streamCompleteThreadId.current = completedThreadId;
      refetchThreads();
      // If the completed thread is currently selected, also refetch its messages
      if (completedThreadId === selectedThreadId) {
        refetchThread();
      }
    },
    [selectedThreadId, refetchThread, refetchThreads]
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
  }, [wsUrl]);

  // Switch workspace handler
  const handleSelectWorkspace = useCallback((id: string) => {
    if (id === activeWorkspaceId) return;
    setActiveWorkspaceId(id);
    setSelectedThreadId(null);
  }, [activeWorkspaceId]);

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
    async (id: string, updates: { name?: string; color?: string }) => {
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

  const handleSendMessage = useCallback(
    async (content: string, images?: MessageImage[]) => {
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
    />
  );

  const handleWorkspaceAdded = useCallback((ws: { id: string; name: string; directory: string; color: string; addedAt: string }) => {
    setWorkspaces((prev) => [...prev, ws]);
    setActiveWorkspaceId(ws.id);
    setSelectedThreadId(null);
    setShowAddWorkspace(false);
  }, []);

  if (workspaces.length === 0) {
    return (
      <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
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
    <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
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
        workspaceId={activeWorkspaceId}
      />
      <AddWorkspaceDialog
        open={showAddWorkspace}
        onClose={() => setShowAddWorkspace(false)}
        onAdded={handleWorkspaceAdded}
      />
    </div>
    </WorkspaceProvider>
  );
}
