"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Dialog from "./Dialog";
import DirectoryBrowser from "./DirectoryBrowser";
import { Workspace, Icon } from "@/lib/types";
import IconPicker, { renderIcon } from "./IconPicker";

const LIGHT_GRADIENTS = [
  "linear-gradient(135deg, #f5f5f4, #e7e5e4)", // white/stone
  "linear-gradient(135deg, #a78bfa, #818cf8)", // violet → indigo
  "linear-gradient(135deg, #60a5fa, #38bdf8)", // blue → sky
  "linear-gradient(135deg, #34d399, #2dd4bf)", // emerald → teal
  "linear-gradient(135deg, #fbbf24, #f59e0b)", // amber light → amber
  "linear-gradient(135deg, #fb923c, #f97316)", // orange light → orange
  "linear-gradient(135deg, #f472b6, #e879f9)", // pink → fuchsia
  "linear-gradient(135deg, #38bdf8, #34d399)", // sky → emerald
  "linear-gradient(135deg, #a78bfa, #f472b6)", // violet → pink
];

const DARK_GRADIENTS = [
  "linear-gradient(135deg, #27272a, #18181b)", // black/zinc
  "linear-gradient(135deg, #7c3aed, #4f46e5)", // violet → indigo
  "linear-gradient(135deg, #2563eb, #0284c7)", // blue → sky
  "linear-gradient(135deg, #059669, #0d9488)", // emerald → teal
  "linear-gradient(135deg, #d97706, #b45309)", // amber → amber dark
  "linear-gradient(135deg, #ea580c, #c2410c)", // orange → orange dark
  "linear-gradient(135deg, #db2777, #c026d3)", // pink → fuchsia
  "linear-gradient(135deg, #0369a1, #0f766e)", // sky → teal
  "linear-gradient(135deg, #6d28d9, #be185d)", // violet → rose
];

const GRADIENTS = [...LIGHT_GRADIENTS, ...DARK_GRADIENTS];

type Props = {
  open: boolean;
  onClose: () => void;
  onAdded: (workspace: Workspace) => void;
  inline?: boolean;
};

export default function AddWorkspaceDialog({ open, onClose, onAdded, inline }: Props) {
  const [directory, setDirectory] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(GRADIENTS[0]);
  const [icon, setIcon] = useState<Icon | undefined>(undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const getInitials = (name: string) => {
    const words = name.split(/[\s-_]+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };


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
      setColor(GRADIENTS[0]);
      setIcon(undefined);
      onClose();
    } catch {
      setError("Failed to add workspace");
    } finally {
      setLoading(false);
    }
  };

  const formContent = (
    <div className={inline ? "bg-white dark:bg-zinc-800 rounded-xl shadow-2xl w-full max-w-md p-4 md:p-6 max-h-[85vh] flex flex-col" : "bg-white dark:bg-zinc-800 rounded-xl shadow-2xl w-full max-w-md p-4 md:p-6 mx-4 max-h-[85vh] flex flex-col"}>
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
          <div className="space-y-2">
            <div>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 mb-1 block">Light</span>
              <div className="flex gap-2">
                {LIGHT_GRADIENTS.map((g, i) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setColor(g)}
                    className={`w-8 h-8 rounded-lg box-border transition-all ${i === 0 ? "border border-zinc-200 dark:border-zinc-600" : ""} ${
                      color === g ? "ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100 dark:ring-offset-zinc-800" : "hover:scale-105"
                    }`}
                    style={{ background: g }}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 mb-1 block">Dark</span>
              <div className="flex gap-2">
                {DARK_GRADIENTS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setColor(g)}
                    className={`w-8 h-8 rounded-lg box-border transition-all ${
                      color === g ? "ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100 dark:ring-offset-zinc-800" : "hover:scale-105"
                    }`}
                    style={{ background: g }}
                  />
                ))}
              </div>
            </div>
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
              style={{ background: color }}
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
    if (!open) return null;
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        {formContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onClose={onClose}>
      {formContent}
    </Dialog>
  );
}
