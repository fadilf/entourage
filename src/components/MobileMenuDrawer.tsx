"use client";

import { useEffect } from "react";
import { Settings, Plus, GitBranch, FolderOpen, X } from "lucide-react";
import { Workspace } from "@/lib/types";
import { renderIcon } from "./IconPicker";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onAddWorkspace: () => void;
  onOpenSettings: () => void;
  enabledPlugins: string[];
  onPluginClick: (pluginId: string) => void;
  gitChangeCount: number;
  gitIsRepo: boolean;
};

export default function MobileMenuDrawer({
  open,
  onClose,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onAddWorkspace,
  onOpenSettings,
  enabledPlugins,
  onPluginClick,
  gitChangeCount,
  gitIsRepo,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const getInitials = (name: string) => {
    const words = name.split(/[\s-_]+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Drawer */}
      <div className="relative w-72 max-w-[80vw] bg-white dark:bg-zinc-900 h-full shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Menu</span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Workspaces */}
          <div className="px-4 pt-4 pb-2">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
              Workspaces
            </div>
            <div className="flex flex-col gap-1">
              {workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <button
                    key={ws.id}
                    onClick={() => {
                      onSelectWorkspace(ws.id);
                      onClose();
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? "bg-zinc-100 dark:bg-zinc-800"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                      style={{ background: ws.color }}
                    >
                      {ws.icon ? renderIcon(ws.icon, "h-4 w-4") : getInitials(ws.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {ws.name}
                      </div>
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {ws.directory}
                      </div>
                    </div>
                    {isActive && (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                    )}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  onAddWorkspace();
                  onClose();
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600">
                  <Plus className="h-4 w-4" />
                </div>
                <span className="text-sm">Add workspace</span>
              </button>
            </div>
          </div>

          {/* Plugins */}
          {(enabledPlugins.includes("git") || enabledPlugins.includes("files")) && (
            <div className="px-4 pt-4 pb-2">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                Plugins
              </div>
              <div className="flex flex-col gap-1">
                {enabledPlugins.includes("git") && (
                  <button
                    onClick={() => {
                      if (gitIsRepo) {
                        onPluginClick("git");
                        onClose();
                      }
                    }}
                    disabled={!gitIsRepo}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      gitIsRepo
                        ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        : "opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                      <GitBranch className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">Source Control</span>
                    {gitChangeCount > 0 && gitIsRepo && (
                      <span className="ml-auto rounded-full bg-violet-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {gitChangeCount > 99 ? "99+" : gitChangeCount}
                      </span>
                    )}
                  </button>
                )}
                {enabledPlugins.includes("files") && (
                  <button
                    onClick={() => {
                      onPluginClick("files");
                      onClose();
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                      <FolderOpen className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">File Browser</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Settings */}
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-4 py-3">
          <button
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <Settings className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <span className="text-sm text-zinc-900 dark:text-zinc-100">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
