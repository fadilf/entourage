"use client";

import { useState } from "react";
import { Agent, ThreadWithMessages } from "@/lib/types";
import Dialog from "./Dialog";
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
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? "");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !selectedAgentId) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/threads${workspaceId ? `?workspaceId=${workspaceId}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), agentIds: [selectedAgentId] }),
      });
      if (res.ok) {
        const thread = await res.json();
        setTitle("");
        setSelectedAgentId(agents[0]?.id ?? "");
        onCreated(thread);
        onClose();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-zinc-800 p-4 md:p-6 shadow-xl mx-4">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">New Thread</h3>

        <div className="mt-4">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you working on?"
            className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
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
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Starting Agent</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {agents.map((agent) => {
              const selected = selectedAgentId === agent.id;
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                      : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600"
                  }`}
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-zinc-800"
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
            className="rounded-lg px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || !selectedAgentId || creating}
            className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
