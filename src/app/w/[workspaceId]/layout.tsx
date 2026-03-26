"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ThreadListItem, ThreadWithMessages, ThreadProcess, Agent, Workspace, Icon } from "@/lib/types";
import { useFetch } from "@/hooks/useFetch";
import { useIsMobile } from "@/hooks/useIsMobile";
import ThreadList from "@/components/ThreadList";
import NewThreadDialog from "@/components/NewThreadDialog";
import SettingsDialog from "@/components/SettingsDialog";
import WorkspaceBar from "@/components/WorkspaceBar";
import AddWorkspaceDialog from "@/components/AddWorkspaceDialog";
import GitDialog from "@/components/GitDialog";
import FileBrowserDialog from "@/components/FileBrowserDialog";
import TerminalDialog from "@/components/TerminalDialog";
import MobileMenuDrawer from "@/components/MobileMenuDrawer";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { WorkspaceLayoutProvider, WorkspaceLayoutContextValue } from "@/contexts/WorkspaceLayoutContext";
import { PLUGINS } from "@/lib/plugins";

const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 600;
const SIDEBAR_DEFAULT = 320;

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ workspaceId: string; threadId?: string }>();
  const workspaceId = params.workspaceId;
  const selectedThreadId = params.threadId ?? null;
  const router = useRouter();
  const isMobile = useIsMobile();

  // Workspace state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [showAddWorkspace, setShowAddWorkspace] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGitDialog, setShowGitDialog] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [gitChangeCount, setGitChangeCount] = useState(0);
  const [gitIsRepo, setGitIsRepo] = useState(true);
  const [statuses, setStatuses] = useState<ThreadProcess[]>([]);
  const [unreadByThread, setUnreadByThread] = useState<Record<string, string[]>>({});

  // Resizable sidebar — read initial value from localStorage synchronously
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT;
    const saved = localStorage.getItem("entourage-sidebar-width");
    return saved ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Number(saved))) : SIDEBAR_DEFAULT;
  });
  const isResizing = useRef(false);

  // wsUrl helper — workspaceId is always defined in this layout
  const wsUrl = useCallback(
    (path: string) => {
      const separator = path.includes("?") ? "&" : "?";
      return `${path}${separator}workspaceId=${workspaceId}`;
    },
    [workspaceId]
  );

  // Load workspaces on mount
  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((ws: Workspace[]) => {
        setWorkspaces(ws);
        // Validate workspaceId from URL
        if (!ws.find((w) => w.id === workspaceId)) {
          router.replace("/");
          return;
        }
        setWorkspacesLoaded(true);
      })
      .catch(() => {
        setWorkspacesLoaded(true);
      });
  }, [workspaceId, router]);

  // Persist active workspace to localStorage
  useEffect(() => {
    localStorage.setItem("entourage-active-workspace", workspaceId);
  }, [workspaceId]);

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

  useEffect(() => {
    localStorage.setItem("entourage-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  // Config
  const [config, , refetchConfig] = useFetch<{ agents: Agent[]; displayName?: string; quickReplies?: { enabled: boolean }; toolCallGrouping?: { enabled: boolean } }>("/api/config");
  const agents = config?.agents ?? [];
  const displayName = config?.displayName ?? "You";
  const quickRepliesEnabled = config?.quickReplies?.enabled ?? false;
  const toolCallGroupingEnabled = config?.toolCallGrouping?.enabled ?? false;

  const enabledPlugins = useMemo(() => {
    if (!config) return [];
    const plugins = (config as Record<string, unknown>).plugins as Record<string, boolean> | undefined;
    return PLUGINS
      .filter((p) => plugins?.[p.id] ?? p.enabledByDefault)
      .map((p) => p.id);
  }, [config]);

  // Threads
  const threadsUrl = wsUrl("/api/threads");
  const [threads, , refetchThreads] = useFetch<ThreadListItem[]>(threadsUrl);
  const threadList = threads ?? [];

  // Status polling
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

  // Document title
  const activeWorkspace = workspaces.find((w) => w.id === workspaceId);
  const activeWorkspaceName = activeWorkspace?.name;
  useEffect(() => {
    document.title = activeWorkspaceName ? `${activeWorkspaceName} | Entourage` : "Entourage";
  }, [activeWorkspaceName]);

  // Git badge
  const fetchGitBadge = useCallback(async () => {
    if (!enabledPlugins.includes("git")) {
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
  }, [enabledPlugins, wsUrl]);

  useEffect(() => {
    fetchGitBadge(); // eslint-disable-line react-hooks/set-state-in-effect -- legitimate poll-on-mount pattern
    const interval = setInterval(fetchGitBadge, 5000);
    return () => clearInterval(interval);
  }, [fetchGitBadge]);

  // Navigation helpers
  const navigateToThread = useCallback(
    (threadId: string) => router.push(`/w/${workspaceId}/${threadId}`),
    [router, workspaceId]
  );

  const navigateToWorkspace = useCallback(
    () => router.push(`/w/${workspaceId}`),
    [router, workspaceId]
  );

  // Workspace handlers
  const handleSelectWorkspace = useCallback(
    (id: string) => {
      if (id === workspaceId) return;
      router.push(`/w/${id}`);
    },
    [workspaceId, router]
  );

  const handleRemoveWorkspace = useCallback(
    async (id: string) => {
      await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
      setWorkspaces((prev) => {
        const next = prev.filter((w) => w.id !== id);
        if (workspaceId === id) {
          if (next.length > 0) {
            router.replace(`/w/${next[0].id}`);
          } else {
            router.replace("/");
          }
        }
        return next;
      });
    },
    [workspaceId, router]
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

  const handlePluginClick = useCallback((pluginId: string) => {
    if (pluginId === "git") setShowGitDialog(true);
    if (pluginId === "files") setShowFileBrowser(true);
    if (pluginId === "terminal") setShowTerminal(true);
  }, []);

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
        router.push(`/w/${workspaceId}`);
      }
    },
    [refetchThreads, selectedThreadId, wsUrl, router, workspaceId]
  );

  const handleThreadCreated = useCallback(
    (thread: ThreadWithMessages) => {
      refetchThreads();
      router.push(`/w/${workspaceId}/${thread.id}`);
    },
    [refetchThreads, router, workspaceId]
  );

  const handleWorkspaceAdded = useCallback(
    (ws: Workspace) => {
      setWorkspaces((prev) => [...prev, ws]);
      setShowAddWorkspace(false);
      router.push(`/w/${ws.id}`);
    },
    [router]
  );

  // Context value
  const contextValue: WorkspaceLayoutContextValue = {
    workspaces,
    activeWorkspaceId: workspaceId,
    activeWorkspace,
    threads: threadList,
    refetchThreads,
    agents,
    displayName,
    quickRepliesEnabled,
    toolCallGroupingEnabled,
    refetchConfig,
    statuses,
    unreadByThread,
    wsUrl,
    navigateToThread,
    navigateToWorkspace,
    openNewThread: () => setShowNewThread(true),
    handleRemoveWorkspace,
    handleEditWorkspace,
    handleReorderWorkspaces,
    handleSelectWorkspace,
    openAddWorkspace: () => setShowAddWorkspace(true),
    openSettings: () => setShowSettings(true),
    enabledPlugins,
    handlePluginClick,
    gitChangeCount,
    gitIsRepo,
    isMobile,
    openMobileMenu: () => setShowMobileMenu(true),
  };

  // Loading skeleton
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

  const threadListEl = (
    <ThreadList
      threads={threadList}
      selectedThreadId={selectedThreadId}
      onSelectThread={(id) => router.push(`/w/${workspaceId}/${id}`)}
      onNewThread={() => setShowNewThread(true)}
      onOpenMenu={() => setShowMobileMenu(true)}
      onArchiveThread={handleArchiveThread}
      statuses={statuses}
      unreadByThread={unreadByThread}
      isMobile={isMobile}
      workspaceName={activeWorkspaceName}
      onRenameWorkspace={(name) => handleEditWorkspace(workspaceId, { name })}
    />
  );

  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <WorkspaceLayoutProvider value={contextValue}>
        <div className="flex h-dvh overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
          {isMobile ? (
            // On mobile: show thread list when no thread is selected, otherwise show children (thread page)
            selectedThreadId ? children : threadListEl
          ) : (
            <>
              <WorkspaceBar
                workspaces={workspaces}
                activeWorkspaceId={workspaceId}
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
              {children}
            </>
          )}
          <NewThreadDialog
            open={showNewThread}
            agents={agents}
            onClose={() => setShowNewThread(false)}
            onCreated={handleThreadCreated}
            workspaceId={workspaceId}
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
            workspaceId={workspaceId}
          />
          <FileBrowserDialog
            open={showFileBrowser}
            onClose={() => setShowFileBrowser(false)}
            workspaceId={workspaceId}
          />
          <TerminalDialog
            open={showTerminal}
            onClose={() => setShowTerminal(false)}
            workspaceId={workspaceId}
          />
          {isMobile && (
            <MobileMenuDrawer
              open={showMobileMenu}
              onClose={() => setShowMobileMenu(false)}
              workspaces={workspaces}
              activeWorkspaceId={workspaceId}
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
      </WorkspaceLayoutProvider>
    </WorkspaceProvider>
  );
}
