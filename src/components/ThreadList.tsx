import { ThreadListItem, ThreadProcess } from "@/lib/types";
import ModelIcon from "./ModelIcon";
import AgentStatusBadge from "./AgentStatusBadge";
import { Settings } from "lucide-react";

function formatDate(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ThreadList({
  threads,
  selectedThreadId,
  onSelectThread,
  onNewThread,
  onOpenSettings,
  statuses,
}: {
  threads: ThreadListItem[];
  selectedThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onOpenSettings: () => void;
  statuses: ThreadProcess[];
}) {
  return (
    <div className="flex h-full w-[35%] min-w-[280px] flex-col border-r border-zinc-200">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">Nexus</h1>
        <button
          onClick={onNewThread}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-zinc-400">
            No threads yet. Create one to get started.
          </div>
        )}
        {threads.map((thread) => {
          const isSelected = thread.id === selectedThreadId;
          const firstAgent = thread.agents[0];
          const threadStatuses = statuses.filter((s) => s.threadId === thread.id);
          const hasRunning = threadStatuses.some((s) => s.status === "running");
          const hasError = threadStatuses.some((s) => s.status === "error");

          return (
            <button
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
              className={`flex w-full gap-3 px-5 py-3.5 text-left transition-colors hover:bg-zinc-100 ${
                isSelected ? "bg-zinc-100" : "cursor-pointer"
              }`}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100"
                style={firstAgent ? { border: `1.5px solid ${firstAgent.avatarColor}`, boxShadow: `inset 0 2px 6px ${firstAgent.avatarColor}80` } : undefined}
              >
                {firstAgent && (
                  <ModelIcon model={firstAgent.model} icon={firstAgent.icon} className="h-5 w-5" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-900">
                    {thread.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(hasRunning || hasError) && (
                      <AgentStatusBadge status={hasRunning ? "running" : "error"} />
                    )}
                    <span className="text-[11px] text-zinc-500">
                      {formatDate(thread.updatedAt)}
                    </span>
                  </div>
                </div>
                <span className="truncate text-xs text-zinc-500">
                  {thread.agents.map((a) => a.name).join(", ")}
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-zinc-500">
                    {thread.lastMessagePreview}
                  </span>
                  {thread.messageCount > 0 && (
                    <span className="shrink-0 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500">
                      {thread.messageCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="border-t border-zinc-200 px-5 py-3">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </div>
  );
}
