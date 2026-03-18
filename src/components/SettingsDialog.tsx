"use client";

import { useState, useEffect, useCallback } from "react";
import { Agent, AgentModel, Icon } from "@/lib/types";
import { PLUGINS } from "@/lib/plugins";
import Dialog from "./Dialog";
import ModelIcon from "./ModelIcon";
import IconPicker from "./IconPicker";
import { ArrowLeft, GripVertical, Pencil, Trash2, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

type AgentFormData = {
  name: string;
  model: AgentModel;
  avatarColor: string;
  icon?: Icon;
  personality?: string;
};

const COLOR_PRESETS = [
  "#d97706", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#f59e0b", "#06b6d4", "#6366f1", "#14b8a6",
  "#f97316", "#84cc16",
];

const emptyForm: AgentFormData = {
  name: "",
  model: "claude",
  avatarColor: "#8b5cf6",
};

type Tab = "general" | "agents" | "plugins";

export default function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<AgentFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [displayName, setDisplayName] = useState("");
  const [savedDisplayName, setSavedDisplayName] = useState("");
  const [plugins, setPlugins] = useState<Record<string, boolean>>({});
  const [quickRepliesEnabled, setQuickRepliesEnabled] = useState(false);
  const [quickRepliesAgentId, setQuickRepliesAgentId] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    const res = await fetch(`/api/agents`);
    if (res.ok) setAgents(await res.json());
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await fetch(`/api/config`);
    if (res.ok) {
      const data = await res.json();
      setDisplayName(data.displayName || "");
      setSavedDisplayName(data.displayName || "");
      setPlugins(data.plugins || {});
      if (data.quickReplies) {
        setQuickRepliesEnabled(data.quickReplies.enabled);
        setQuickRepliesAgentId(data.quickReplies.agentId);
      }
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchAgents();
      fetchConfig();
    }
  }, [open, fetchAgents, fetchConfig]);

  const handleSaveDisplayName = async () => {
    const res = await fetch(`/api/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    if (res.ok) {
      const data = await res.json();
      setSavedDisplayName(data.displayName);
      setDisplayName(data.displayName);
    }
  };

  const showForm = editingAgent !== null || isCreating;

  const startCreate = () => {
    setForm(emptyForm);
    setEditingAgent(null);
    setIsCreating(true);
    setError("");
  };

  const startEdit = (agent: Agent) => {
    setForm({
      name: agent.name,
      model: agent.model,
      avatarColor: agent.avatarColor,
      icon: agent.icon,
      personality: agent.personality,
    });
    setEditingAgent(agent);
    setIsCreating(false);
    setError("");
  };

  const cancelForm = () => {
    setEditingAgent(null);
    setIsCreating(false);
    setError("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(form.name.trim())) {
      setError("Name must contain only letters and numbers (no spaces or special characters)");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const body = {
        name: form.name.trim(),
        model: form.model,
        avatarColor: form.avatarColor,
        icon: form.icon,
        personality: form.personality?.trim() || undefined,
      };

      let res: Response;
      if (editingAgent) {
        res = await fetch(`/api/agents/${editingAgent.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/agents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }

      await fetchAgents();
      cancelForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agent: Agent) => {
    const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchAgents();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to delete");
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-white dark:bg-zinc-800 shadow-xl mx-4" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="border-b border-zinc-200 dark:border-zinc-700 px-4 md:px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              {showForm && (
                <button onClick={cancelForm} className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {showForm
                  ? editingAgent
                    ? `Edit ${editingAgent.name}`
                    : "New Agent"
                  : "Settings"}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 text-xl leading-none"
            >
              &times;
            </button>
          </div>
          {!showForm && (
            <div className="flex gap-1 -mb-px">
              {([["general", "General"], ["agents", "Agent Profiles"], ["plugins", "Plugins"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setTab(key); setError(""); }}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    tab === key
                      ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {showForm ? (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                  {error}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Joker"
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  autoFocus
                />
              </div>

              {/* Model */}
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Model</label>
                <div className="mt-1 flex gap-1">
                  {(["claude", "gemini", "codex", "opencode"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, model: m }))}
                      className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        form.model === m
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                          : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600"
                      }`}
                    >
                      <ModelIcon model={m} className="h-3.5 w-3.5" />
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Color</label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, avatarColor: color }))}
                      className={`h-7 w-7 rounded-full transition-transform ${
                        form.avatarColor === color ? "scale-110 ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100 dark:ring-offset-zinc-800" : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="text"
                    value={form.avatarColor}
                    onChange={(e) => setForm((f) => ({ ...f, avatarColor: e.target.value }))}
                    className="w-20 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="#hex"
                  />
                </div>
              </div>

              {/* Icon */}
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Icon</label>
                <div className="mt-1">
                  <IconPicker
                    value={form.icon}
                    onChange={(icon) => setForm((f) => ({ ...f, icon }))}
                  />
                </div>
              </div>

              {/* Personality */}
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Personality</label>
                <textarea
                  value={form.personality ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))}
                  placeholder="System prompt for this agent. Supports markdown. Example: You are a meticulous code reviewer who focuses on security, performance, and maintainability..."
                  rows={6}
                  className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={cancelForm}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim()}
                  className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingAgent ? "Save Changes" : "Create Agent"}
                </button>
              </div>
            </div>
          ) : tab === "general" ? (
            <div className="space-y-6">
              {/* Theme toggle */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Theme</span>
                {mounted && (
                  <button
                    onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                    title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
                  >
                    {resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </button>
                )}
              </div>

              {/* Display Name */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Display Name</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-48 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                  {displayName !== savedDisplayName && (
                    <button
                      onClick={handleSaveDisplayName}
                      className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Replies */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Quick Replies</span>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">Suggest follow-up replies after agents respond</p>
                </div>
                <button
                  onClick={async () => {
                    const next = !quickRepliesEnabled;
                    setQuickRepliesEnabled(next);
                    await fetch("/api/config", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ quickRepliesEnabled: next }),
                    });
                  }}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    quickRepliesEnabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      quickRepliesEnabled ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>

              {quickRepliesEnabled && (
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Suggestion Agent</span>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">Which agent generates suggestions</p>
                  </div>
                  <select
                    value={quickRepliesAgentId}
                    onChange={async (e) => {
                      const agentId = e.target.value;
                      setQuickRepliesAgentId(agentId);
                      await fetch("/api/config", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ quickRepliesAgentId: agentId }),
                      });
                    }}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : tab === "agents" ? (
            <div className="space-y-1">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Agent Profiles</h4>
                <button
                  onClick={startCreate}
                  className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                >
                  + Add Agent
                </button>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 mb-2">
                  {error}
                </div>
              )}

              {agents.map((agent) => (
                <div
                  key={agent.id}
                  draggable
                  onDragStart={() => setDragId(agent.id)}
                  onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverId(agent.id); }}
                  onDrop={() => {
                    if (dragId && dragId !== agent.id) {
                      const ids = agents.map((a) => a.id);
                      const fromIdx = ids.indexOf(dragId);
                      ids.splice(fromIdx, 1);
                      const toIdx = ids.indexOf(agent.id);
                      ids.splice(toIdx, 0, dragId);
                      const reordered = ids.map((id) => agents.find((a) => a.id === id)!);
                      setAgents(reordered);
                      fetch("/api/agents/reorder", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ orderedIds: ids }),
                      });
                    }
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 ${
                    dragId === agent.id ? "opacity-40" : ""
                  } ${dragOverId === agent.id && dragId !== agent.id ? "ring-2 ring-violet-500 ring-inset" : ""}`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-300 dark:text-zinc-600" />
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white dark:bg-zinc-800"
                    style={{
                      border: `1.5px solid ${agent.avatarColor}`,
                      boxShadow: `inset 0 2px 6px ${agent.avatarColor}80`,
                    }}
                  >
                    <ModelIcon model={agent.model} icon={agent.icon} className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{agent.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {agent.model}
                      {agent.isDefault && " · default"}
                      {agent.personality && " · has personality"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(agent)}
                      className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {!agent.isDefault && (
                      <button
                        onClick={() => handleDelete(agent)}
                        className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "plugins" ? (
            <div className="space-y-1">
              <h4 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Plugins</h4>
              {PLUGINS.map((plugin) => {
                const enabled = plugins[plugin.id] ?? plugin.enabledByDefault;
                return (
                  <div
                    key={plugin.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  >
                    <div>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{plugin.name}</span>
                    </div>
                    <button
                      onClick={async () => {
                        const updated = { ...plugins, [plugin.id]: !enabled };
                        setPlugins(updated);
                        await fetch("/api/config", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ plugins: updated }),
                        });
                      }}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        enabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-600"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          enabled ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
