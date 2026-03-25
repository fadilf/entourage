"use client";

import { useState } from "react";
import type { Agent } from "@/lib/types";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import ModelIcon from "../ModelIcon";

type AgentProfilesPanelProps = {
  agents: Agent[];
  error: string;
  onStartCreate: () => void;
  onStartEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void | Promise<void>;
  onReorder: (orderedIds: string[]) => void | Promise<void>;
};

export default function AgentProfilesPanel({
  agents,
  error,
  onStartCreate,
  onStartEdit,
  onDelete,
  onReorder,
}: AgentProfilesPanelProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }

    const ids = agents.map((agent) => agent.id);
    const fromIndex = ids.indexOf(dragId);
    const toIndex = ids.indexOf(targetId);

    if (fromIndex === -1 || toIndex === -1) {
      setDragId(null);
      setDragOverId(null);
      return;
    }

    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, dragId);
    void onReorder(ids);
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <div className="space-y-1">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Agent Profiles</h4>
        <button
          onClick={onStartCreate}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          + Add Agent
        </button>
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {agents.map((agent) => (
        <div
          key={agent.id}
          draggable
          onDragStart={() => setDragId(agent.id)}
          onDragEnd={() => {
            setDragId(null);
            setDragOverId(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverId(agent.id);
          }}
          onDrop={() => handleDrop(agent.id)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 ${
            dragId === agent.id ? "opacity-40" : ""
          } ${dragOverId === agent.id && dragId !== agent.id ? "ring-2 ring-inset ring-violet-500" : ""}`}
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
              {agent.cliModel && `:${agent.cliModel}`}
              {agent.isDefault && " · default"}
              {agent.personality && " · has personality"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onStartEdit(agent)}
              className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {!agent.isDefault && (
              <button
                onClick={() => onDelete(agent)}
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
  );
}
