"use client";

import { useState } from "react";
import { X } from "lucide-react";
import DirectoryBrowser from "./DirectoryBrowser";
import { Workspace, Icon } from "@/lib/types";
import IconPicker, { renderIcon } from "./IconPicker";

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

type Props = {
  open: boolean;
  onClose: () => void;
  onAdded: (workspace: Workspace) => void;
  inline?: boolean;
};

export default function AddWorkspaceDialog({ open, onClose, onAdded, inline }: Props) {
  const [directory, setDirectory] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState<Icon | undefined>(undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const getInitials = (name: string) => {
    const words = name.split(/[\s-_]+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  if (!open && !inline) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!directory.trim()) {
      setError("Directory path is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directory: directory.trim(),
          name: name.trim() || undefined,
          color,
          icon,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add workspace");
        return;
      }

      const workspace = await res.json();
      onAdded(workspace);
      setDirectory("");
      setName("");
      setColor(COLORS[0]);
      setIcon(undefined);
      onClose();
    } catch {
      setError("Failed to add workspace");
    } finally {
      setLoading(false);
    }
  };

  const formContent = (
    <div className={inline ? "bg-white dark:bg-zinc-800 rounded-xl shadow-2xl w-full max-w-md p-4 md:p-6" : "bg-white dark:bg-zinc-800 rounded-xl shadow-2xl w-full max-w-md p-4 md:p-6 mx-4 max-h-[85vh] flex flex-col"}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Add Workspace</h2>
        {!inline && (
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            <X size={20} />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 min-h-0">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Project Directory
          </label>
          <DirectoryBrowser value={directory} onChange={setDirectory} />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Name <span className="text-zinc-400 dark:text-zinc-500">(optional)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Defaults to directory name"
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Color
          </label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-lg transition-all ${
                  color === c ? "ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100 dark:ring-offset-zinc-800 scale-110" : "hover:scale-105"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Icon <span className="text-zinc-400 dark:text-zinc-500">(optional)</span>
          </label>

          {/* Live preview */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              {icon ? (
                renderIcon(icon, "h-5 w-5")
              ) : (
                <span>{getInitials(name || directory.split("/").pop() || "WS")}</span>
              )}
            </div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">Preview</span>
          </div>

          <IconPicker
            value={icon}
            onChange={setIcon}
            enableUpload
          />
          {icon && (
            <button
              type="button"
              onClick={() => setIcon(undefined)}
              className="mt-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Remove icon
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className={`flex gap-2 pt-2 ${inline ? "justify-end" : "justify-end"}`}>
          {!inline && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add Workspace"}
          </button>
        </div>
      </form>
    </div>
  );

  if (inline) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        {formContent}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {formContent}
    </div>
  );
}
