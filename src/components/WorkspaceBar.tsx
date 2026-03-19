"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Pencil, Trash2, FolderOpen, Settings, Palette, GitBranch, HelpCircle, Terminal } from "lucide-react";
import AboutDialog from "./AboutDialog";
import { Workspace, Icon } from "@/lib/types";
import IconPicker, { renderIcon } from "./IconPicker";
import Logo from "@/components/Logo";

type Props = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (id: string) => void;
  onEditWorkspace: (id: string, updates: { name?: string; color?: string; icon?: Icon | null }) => void;
  onReorderWorkspaces: (orderedIds: string[]) => void;
  onOpenSettings: () => void;
  enabledPlugins?: string[];
  onPluginClick?: (pluginId: string) => void;
  gitChangeCount?: number;
  gitIsRepo?: boolean;
};

export default function WorkspaceBar({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onAddWorkspace,
  onRemoveWorkspace,
  onEditWorkspace,
  onReorderWorkspaces,
  onOpenSettings,
  enabledPlugins = [],
  onPluginClick,
  gitChangeCount = 0,
  gitIsRepo = true,
}: Props) {
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  const [iconPickerTop, setIconPickerTop] = useState(100);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const wsButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hasVisiblePlugins = enabledPlugins.includes("git") || enabledPlugins.includes("files") || enabledPlugins.includes("terminal");

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [contextMenu]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setIconPickerFor(null);
      }
    };
    if (iconPickerFor) {
      const btn = wsButtonRefs.current.get(iconPickerFor);
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setIconPickerTop(Math.min(rect.top, window.innerHeight - 350));
      }
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [iconPickerFor]);

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const getInitials = (name: string) => {
    const words = name.split(/[\s-_]+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const handleRenameSubmit = (id: string) => {
    if (editName.trim()) {
      onEditWorkspace(id, { name: editName.trim() });
    }
    setEditing(null);
  };

  return (
    <div className="flex flex-col items-center w-16 bg-zinc-900 py-3 px-2 gap-2 flex-shrink-0 border-r border-zinc-700">
      {/* Logo */}
      <div className="w-10 h-10 flex items-center justify-center">
        <Logo className="h-7 w-7" />
      </div>

      {/* Separator — extends past padding to connect with ThreadList header border */}
      <div className="-mx-2 self-stretch h-px bg-zinc-700 mb-1" />

      {/* Plugin icons */}
      {enabledPlugins.includes("git") && (
        <button
          onClick={() => onPluginClick?.("git")}
          disabled={!gitIsRepo}
          className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            gitIsRepo
              ? "text-zinc-400 hover:text-white hover:bg-zinc-700"
              : "text-zinc-600 cursor-not-allowed"
          }`}
          title={gitIsRepo ? "Source Control" : "Not a git repository"}
        >
          <GitBranch size={20} />
          {gitChangeCount > 0 && gitIsRepo && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-medium text-white">
              {gitChangeCount > 99 ? "99+" : gitChangeCount}
            </span>
          )}
        </button>
      )}

      {enabledPlugins.includes("files") && (
        <button
          onClick={() => onPluginClick?.("files")}
          className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors text-zinc-400 hover:text-white hover:bg-zinc-700"
          title="File Browser"
        >
          <FolderOpen size={20} />
        </button>
      )}

      {enabledPlugins.includes("terminal") && (
        <button
          onClick={() => onPluginClick?.("terminal")}
          className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors text-zinc-400 hover:text-white hover:bg-zinc-700"
          title="Terminal"
        >
          <Terminal size={20} />
        </button>
      )}

      {/* Separator */}
      <div className="w-8 h-px bg-zinc-700 my-1" />

      {workspaces.map((ws) => {
        const isActive = ws.id === activeWorkspaceId;
        return (
          <div
            key={ws.id}
            className="relative group flex items-center"
            draggable
            onDragStart={() => setDragId(ws.id)}
            onDragEnd={() => { setDragId(null); setDragOverId(null); }}
            onDragOver={(e) => { e.preventDefault(); setDragOverId(ws.id); }}
            onDrop={() => {
              if (dragId && dragId !== ws.id) {
                const ids = workspaces.map((w) => w.id);
                const fromIdx = ids.indexOf(dragId);
                const toIdx = ids.indexOf(ws.id);
                ids.splice(fromIdx, 1);
                ids.splice(toIdx, 0, dragId);
                onReorderWorkspaces(ids);
              }
              setDragId(null);
              setDragOverId(null);
            }}
          >
            {/* Drop indicator */}
            {dragOverId === ws.id && dragId !== ws.id && (
              <div className="absolute -top-1.5 left-3 right-0 h-0.5 bg-violet-500 rounded-full" />
            )}
            {/* Active indicator pill */}
            <div
              className={`absolute -left-2.5 w-1 rounded-r-full transition-all duration-200 ${
                isActive ? "h-8 bg-white" : "h-0 group-hover:h-4 bg-white/60"
              }`}
            />

            {editing === ws.id ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => handleRenameSubmit(ws.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit(ws.id);
                  if (e.key === "Escape") setEditing(null);
                }}
                className="w-10 h-10 rounded-xl text-xs text-center bg-zinc-700 text-white border border-zinc-500 outline-none"
              />
            ) : (
              <>
                <button
                  ref={(el) => { if (el) wsButtonRefs.current.set(ws.id, el); }}
                  onClick={() => onSelectWorkspace(ws.id)}
                  onContextMenu={(e) => handleContextMenu(e, ws.id)}
                  className={`peer w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold text-white transition-all duration-200 ${
                    isActive
                      ? "rounded-2xl shadow-lg shadow-black/30 scale-105"
                      : "hover:rounded-2xl hover:brightness-110"
                  } ${dragId === ws.id ? "opacity-40" : ""}`}
                  style={{ backgroundColor: ws.color }}
                >
                  {ws.icon ? renderIcon(ws.icon, "h-5 w-5") : getInitials(ws.name)}
                </button>
                {/* Tooltip */}
                <div className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 opacity-0 peer-hover:opacity-100 transition-opacity duration-150 z-50">
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                    <div className="text-sm font-medium text-white">{ws.name}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{ws.directory}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Separator */}
      <div className="w-8 h-px bg-zinc-700 my-1" />

      {/* Add workspace */}
      <button
        onClick={onAddWorkspace}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
        title="Add workspace"
      >
        <Plus size={20} />
      </button>

      {/* Spacer to push settings to bottom */}
      <div className="flex-1" />

      {/* Help / About */}
      <button
        onClick={() => setShowAbout(true)}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
        title="About Entourage"
      >
        <HelpCircle size={20} />
      </button>

      {/* Settings gear */}
      <button
        onClick={onOpenSettings}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
        title="Settings"
      >
        <Settings size={20} />
      </button>

      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />

      {/* Context menu via portal to escape overflow-hidden */}
      {contextMenu && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-40"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 text-left"
            onClick={() => {
              const ws = workspaces.find((w) => w.id === contextMenu.id);
              if (ws) {
                setEditName(ws.name);
                setEditing(contextMenu.id);
              }
              setContextMenu(null);
            }}
          >
            <Pencil size={14} />
            Rename
          </button>
          <button
            className="w-full px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 text-left"
            onClick={() => {
              setContextMenu(null);
              setIconPickerFor(contextMenu.id);
            }}
          >
            <Palette size={14} />
            Change Icon
          </button>
          {workspaces.find((w) => w.id === contextMenu.id)?.icon && (
            <button
              className="w-full px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 text-left"
              onClick={() => {
                onEditWorkspace(contextMenu.id, { icon: null });
                setContextMenu(null);
              }}
            >
              <Trash2 size={14} />
              Remove Icon
            </button>
          )}
          <button
            className="w-full px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 text-left"
            onClick={() => {
              setContextMenu(null);
            }}
          >
            <FolderOpen size={14} />
            {workspaces.find((w) => w.id === contextMenu.id)?.directory}
          </button>
          <button
            className="w-full px-3 py-1.5 text-sm text-red-400 hover:bg-zinc-700 flex items-center gap-2 text-left"
            onClick={() => {
              onRemoveWorkspace(contextMenu.id);
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} />
            Remove
          </button>
        </div>,
        document.body
      )}
      {iconPickerFor && createPortal(
        <div
          ref={iconPickerRef}
          className="fixed z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-3 w-72"
          style={{
            left: 72,
            top: iconPickerTop,
          }}
        >
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Workspace Icon</div>
          <IconPicker
            value={workspaces.find((w) => w.id === iconPickerFor)?.icon}
            onChange={(icon) => {
              onEditWorkspace(iconPickerFor, { icon });
              setIconPickerFor(null);
            }}
            enableUpload
          />
        </div>,
        document.body
      )}
    </div>
  );
}
