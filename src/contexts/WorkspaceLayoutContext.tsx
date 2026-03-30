"use client";

import { createContext, useContext } from "react";
import { ThreadListItem, ThreadProcess, Agent, Workspace, Icon } from "@/lib/types";

export interface WorkspaceLayoutContextValue {
  // Workspace data
  workspaces: Workspace[];
  activeWorkspaceId: string;
  activeWorkspace: Workspace | undefined;

  // Thread list
  threads: ThreadListItem[];
  refetchThreads: () => void;

  // Config
  agents: Agent[];
  displayName: string;
  userIcon?: Icon;
  userColor: string;
  quickRepliesEnabled: boolean;
  toolCallGroupingEnabled: boolean;
  refetchConfig: () => void;

  // Status polling
  statuses: ThreadProcess[];
  unreadByThread: Record<string, string[]>;

  // API URL helper
  wsUrl: (path: string) => string;

  // Navigation
  navigateToThread: (threadId: string) => void;
  navigateToWorkspace: () => void;

  // Dialogs
  openNewThread: () => void;

  // Workspace CRUD
  handleRemoveWorkspace: (id: string) => Promise<void>;
  handleEditWorkspace: (id: string, updates: { name?: string; color?: string; icon?: Icon | null }) => Promise<void>;
  handleReorderWorkspaces: (orderedIds: string[]) => Promise<void>;
  handleSelectWorkspace: (id: string) => void;
  openAddWorkspace: () => void;
  openSettings: () => void;

  // Plugins
  enabledPlugins: string[];
  handlePluginClick: (pluginId: string) => void;
  gitChangeCount: number;
  gitIsRepo: boolean;

  // Mobile
  isMobile: boolean;
  openMobileMenu: () => void;
}

const WorkspaceLayoutContext = createContext<WorkspaceLayoutContextValue | null>(null);

export function WorkspaceLayoutProvider({
  value,
  children,
}: {
  value: WorkspaceLayoutContextValue;
  children: React.ReactNode;
}) {
  return <WorkspaceLayoutContext value={value}>{children}</WorkspaceLayoutContext>;
}

export function useWorkspaceLayout(): WorkspaceLayoutContextValue {
  const ctx = useContext(WorkspaceLayoutContext);
  if (!ctx) throw new Error("useWorkspaceLayout must be used within WorkspaceLayoutProvider");
  return ctx;
}
