"use client";

import { useState, useEffect, useCallback } from "react";
import { Agent, AgentModel, AgentIcon } from "@/lib/types";
import ModelIcon from "./ModelIcon";
import IconPicker from "./IconPicker";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";

type AgentFormData = {
  name: string;
  model: AgentModel;
  avatarColor: string;
  icon?: AgentIcon;
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

export default function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<AgentFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.ok) setAgents(await res.json());
  }, []);

  useEffect(() => {
    if (open) fetchAgents();
  }, [open, fetchAgents]);

  if (!open) return null;

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
        res = await fetch("/api/agents", {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center gap-3">
            {showForm && (
              <button onClick={cancelForm} className="text-zinc-500 hover:text-zinc-700">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h3 className="text-lg font-semibold text-zinc-900">
              {showForm
                ? editingAgent
                  ? `Edit ${editingAgent.name}`
                  : "New Agent"
                : "Settings"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {showForm ? (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                  {error}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="text-sm font-medium text-zinc-700">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Code Reviewer"
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  autoFocus
                />
              </div>

              {/* Model */}
              <div>
                <label className="text-sm font-medium text-zinc-700">Model</label>
                <div className="mt-1 flex gap-1">
                  {(["claude", "gemini"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, model: m }))}
                      className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        form.model === m
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
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
                <label className="text-sm font-medium text-zinc-700">Color</label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, avatarColor: color }))}
                      className={`h-7 w-7 rounded-full transition-transform ${
                        form.avatarColor === color ? "scale-110 ring-2 ring-offset-2 ring-zinc-900" : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="text"
                    value={form.avatarColor}
                    onChange={(e) => setForm((f) => ({ ...f, avatarColor: e.target.value }))}
                    className="w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="#hex"
                  />
                </div>
              </div>

              {/* Icon */}
              <div>
                <label className="text-sm font-medium text-zinc-700">Icon</label>
                <div className="mt-1">
                  <IconPicker
                    value={form.icon}
                    onChange={(icon) => setForm((f) => ({ ...f, icon }))}
                  />
                </div>
              </div>

              {/* Personality */}
              <div>
                <label className="text-sm font-medium text-zinc-700">Personality</label>
                <textarea
                  value={form.personality ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))}
                  placeholder="System prompt for this agent. Supports markdown. Example: You are a meticulous code reviewer who focuses on security, performance, and maintainability..."
                  rows={6}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={cancelForm}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim()}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingAgent ? "Save Changes" : "Create Agent"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-medium text-zinc-700">Agent Profiles</h4>
                <button
                  onClick={startCreate}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                >
                  + Add Agent
                </button>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200 mb-2">
                  {error}
                </div>
              )}

              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-50"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white"
                    style={{
                      border: `1.5px solid ${agent.avatarColor}`,
                      boxShadow: `inset 0 2px 6px ${agent.avatarColor}80`,
                    }}
                  >
                    <ModelIcon model={agent.model} icon={agent.icon} className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-zinc-900">{agent.name}</span>
                    <span className="text-xs text-zinc-500">
                      {agent.model}
                      {agent.isDefault && " · default"}
                      {agent.personality && " · has personality"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(agent)}
                      className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {!agent.isDefault && (
                      <button
                        onClick={() => handleDelete(agent)}
                        className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
