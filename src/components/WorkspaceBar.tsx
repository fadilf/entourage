"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Pencil, Trash2, FolderOpen, Settings, Palette } from "lucide-react";
import { Workspace, Icon } from "@/lib/types";
import IconPicker, { renderIcon } from "./IconPicker";

type Props = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (id: string) => void;
  onEditWorkspace: (id: string, updates: { name?: string; color?: string; icon?: Icon | null }) => void;
  onOpenSettings: () => void;
};

export default function WorkspaceBar({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onAddWorkspace,
  onRemoveWorkspace,
  onEditWorkspace,
  onOpenSettings,
}: Props) {
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const wsButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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
    <div className="flex flex-col items-center w-16 bg-zinc-900 py-3 gap-2 flex-shrink-0">
      {/* Settings gear */}
      <button
        onClick={onOpenSettings}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors ml-3"
        title="Settings"
      >
        <Settings size={20} />
      </button>

      {/* Separator */}
      <div className="w-8 h-px bg-zinc-700 my-1" />

      {workspaces.map((ws) => {
        const isActive = ws.id === activeWorkspaceId;
        return (
          <div key={ws.id} className="relative group flex items-center">
            {/* Active indicator pill */}
            <div
              className={`absolute -left-0.5 w-1 rounded-r-full transition-all duration-200 ${
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
                className="w-10 h-10 rounded-xl text-xs text-center bg-zinc-700 text-white border border-zinc-500 outline-none ml-3"
              />
            ) : (
              <button
                ref={(el) => { if (el) wsButtonRefs.current.set(ws.id, el); }}
                onClick={() => onSelectWorkspace(ws.id)}
                onContextMenu={(e) => handleContextMenu(e, ws.id)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold text-white ml-3 transition-all duration-200 ${
                  isActive
                    ? "rounded-2xl shadow-lg shadow-black/30 scale-105"
                    : "hover:rounded-2xl hover:brightness-110"
                }`}
                style={{ backgroundColor: ws.color }}
                title={`${ws.name}\n${ws.directory}`}
              >
                {ws.icon ? renderIcon(ws.icon, "h-5 w-5") : getInitials(ws.name)}
              </button>
            )}
          </div>
        );
      })}

      {/* Separator */}
      <div className="w-8 h-px bg-zinc-700 my-1" />

      {/* Add workspace */}
      <button
        onClick={onAddWorkspace}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors ml-3"
        title="Add workspace"
      >
        <Plus size={20} />
      </button>

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
            top: (() => {
              const btn = wsButtonRefs.current.get(iconPickerFor);
              if (!btn) return 100;
              const rect = btn.getBoundingClientRect();
              return Math.min(rect.top, window.innerHeight - 350);
            })(),
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
