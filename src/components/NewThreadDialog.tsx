"use client";

import { useState } from "react";
import { Agent, ThreadWithMessages } from "@/lib/types";
import ModelIcon from "./ModelIcon";

export default function NewThreadDialog({
  open,
  agents,
  onClose,
  onCreated,
  workspaceId,
}: {
  open: boolean;
  agents: Agent[];
  onClose: () => void;
  onCreated: (thread: ThreadWithMessages) => void;
  workspaceId?: string | null;
}) {
  const [title, setTitle] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([agents[0]?.id].filter(Boolean));
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!title.trim() || !selectedAgentIds.length) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/threads${workspaceId ? `?workspaceId=${workspaceId}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), agentIds: selectedAgentIds }),
      });
      if (res.ok) {
        const thread = await res.json();
        setTitle("");
        setSelectedAgentIds([agents[0]?.id].filter(Boolean));
        onCreated(thread);
        onClose();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-4 md:p-6 shadow-xl mx-4">
        <h3 className="text-lg font-semibold text-zinc-900">New Thread</h3>

        <div className="mt-4">
          <label className="text-sm font-medium text-zinc-700">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you working on?"
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleCreate();
              }
            }}
          />
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-zinc-700">Agents</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {agents.map((agent) => {
              const selected = selectedAgentIds.includes(agent.id);
              return (
                <button
                  key={agent.id}
                  onClick={() => toggleAgent(agent.id)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white"
                    style={{
                      border: `1.5px solid ${agent.avatarColor}`,
                      boxShadow: `inset 0 1px 4px ${agent.avatarColor}80`,
                    }}
                  >
                    <ModelIcon model={agent.model} icon={agent.icon} className="h-3 w-3" />
                  </span>
                  {agent.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || !selectedAgentIds.length || creating}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
