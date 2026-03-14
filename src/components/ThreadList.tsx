import { useState, useRef, useEffect } from "react";
import { ThreadListItem, ThreadProcess } from "@/lib/types";
import ModelIcon from "./ModelIcon";
import AgentStatusBadge from "./AgentStatusBadge";
import { Settings, Archive, ArchiveRestore, ChevronRight } from "lucide-react";

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

function ContextMenu({
  x,
  y,
  onClose,
  items,
}: {
  x: number;
  y: number;
  onClose: () => void;
  items: { label: string; icon: React.ReactNode; onClick: () => void }[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ThreadItem({
  thread,
  isSelected,
  statuses,
  onSelect,
  onContextMenu,
}: {
  thread: ThreadListItem;
  isSelected: boolean;
  statuses: ThreadProcess[];
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const agents = thread.agents;
  const threadStatuses = statuses.filter((s) => s.threadId === thread.id);
  const hasRunning = threadStatuses.some((s) => s.status === "running");
  const hasError = threadStatuses.some((s) => s.status === "error");

  return (
    <button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`flex w-full gap-3 px-5 py-3.5 text-left transition-colors hover:bg-zinc-100 ${
        isSelected ? "bg-zinc-100" : "cursor-pointer"
      }`}
    >
      {agents.length <= 1 ? (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100"
          style={agents[0] ? { border: `1.5px solid ${agents[0].avatarColor}`, boxShadow: `inset 0 2px 6px ${agents[0].avatarColor}80` } : undefined}
        >
          {agents[0] && (
            <ModelIcon model={agents[0].model} icon={agents[0].icon} className="h-5 w-5" />
          )}
        </div>
      ) : (
        <div className="relative h-10 w-10 shrink-0">
          {agents.slice(0, 3).map((agent, i) => {
            const total = Math.min(agents.length, 3);
            const size = total === 2 ? 26 : 22;
            const positions =
              total === 2
                ? [
                    { top: 0, left: 0 },
                    { top: 14, left: 14 },
                  ]
                : [
                    { top: 0, left: 8 },
                    { top: 16, left: 0 },
                    { top: 16, left: 16 },
                  ];
            const pos = positions[i];
            return (
              <div
                key={agent.id}
                className="absolute flex items-center justify-center rounded-full bg-white"
                style={{
                  width: size,
                  height: size,
                  top: pos.top,
                  left: pos.left,
                  border: `1.5px solid ${agent.avatarColor}`,
                  boxShadow: `inset 0 1px 3px ${agent.avatarColor}80`,
                  zIndex: total - i,
                }}
              >
                <ModelIcon
                  model={agent.model}
                  icon={agent.icon}
                  className={total === 2 ? "h-3.5 w-3.5" : "h-3 w-3"}
                />
              </div>
            );
          })}
        </div>
      )}
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
}

export default function ThreadList({
  threads,
  selectedThreadId,
  onSelectThread,
  onNewThread,
  onOpenSettings,
  onArchiveThread,
  statuses,
}: {
  threads: ThreadListItem[];
  selectedThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onOpenSettings: () => void;
  onArchiveThread: (threadId: string, archived: boolean) => void;
  statuses: ThreadProcess[];
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    threadId: string;
    isArchived: boolean;
  } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const activeThreads = threads.filter((t) => !t.archived);
  const archivedThreads = threads.filter((t) => t.archived);

  const handleContextMenu = (e: React.MouseEvent, thread: ThreadListItem) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      threadId: thread.id,
      isArchived: !!thread.archived,
    });
  };

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
        {activeThreads.length === 0 && archivedThreads.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-zinc-400">
            No threads yet. Create one to get started.
          </div>
        )}
        {activeThreads.map((thread) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            isSelected={thread.id === selectedThreadId}
            statuses={statuses}
            onSelect={() => onSelectThread(thread.id)}
            onContextMenu={(e) => handleContextMenu(e, thread)}
          />
        ))}
        {archivedThreads.length > 0 && (
          <div className="border-t border-zinc-100">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex w-full items-center gap-2 px-5 py-2.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${showArchived ? "rotate-90" : ""}`}
              />
              <Archive className="h-3.5 w-3.5" />
              Archived ({archivedThreads.length})
            </button>
            {showArchived &&
              archivedThreads.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  isSelected={thread.id === selectedThreadId}
                  statuses={statuses}
                  onSelect={() => onSelectThread(thread.id)}
                  onContextMenu={(e) => handleContextMenu(e, thread)}
                />
              ))}
          </div>
        )}
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
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            contextMenu.isArchived
              ? {
                  label: "Unarchive",
                  icon: <ArchiveRestore className="h-4 w-4" />,
                  onClick: () => onArchiveThread(contextMenu.threadId, false),
                }
              : {
                  label: "Archive",
                  icon: <Archive className="h-4 w-4" />,
                  onClick: () => onArchiveThread(contextMenu.threadId, true),
                },
          ]}
        />
      )}
    </div>
  );
}
