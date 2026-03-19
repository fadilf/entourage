import { useState } from "react";
import { ThreadListItem, ThreadProcess } from "@/lib/types";
import ModelIcon from "./ModelIcon";
import AgentStatusBadge from "./AgentStatusBadge";
import ContextMenu from "./ContextMenu";
import { Menu, Archive, ArchiveRestore, ChevronRight, MoreHorizontal } from "lucide-react";

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

function ThreadItem({
  thread,
  isSelected,
  statuses,
  unreadByThread,
  onSelect,
  onContextMenu,
  onOverflowMenu,
  isMobile,
}: {
  thread: ThreadListItem;
  isSelected: boolean;
  statuses: ThreadProcess[];
  unreadByThread?: Record<string, string[]>;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onOverflowMenu?: (e: React.MouseEvent) => void;
  isMobile?: boolean;
}) {
  const agents = thread.agents;
  const threadStatuses = statuses.filter((s) => s.threadId === thread.id);
  const hasRunning = threadStatuses.some((s) => s.status === "running");
  const hasError = threadStatuses.some((s) => s.status === "error");
  const unreadAgents = unreadByThread?.[thread.id];
  const hasUnread = unreadAgents && unreadAgents.length > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      onContextMenu={onContextMenu}
      className={`flex w-full gap-3 px-3.5 py-3 text-left transition-colors rounded-xl ${
        isSelected ? "bg-zinc-100 dark:bg-zinc-800" : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      }`}
    >
      {agents.length <= 1 ? (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800"
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
                className="absolute flex items-center justify-center rounded-full bg-white dark:bg-zinc-800"
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
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {thread.title}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasRunning && (
              <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            )}
            {!hasRunning && hasUnread && (
              <span className="h-2 w-2 rounded-full bg-violet-500" />
            )}
            {(hasRunning || hasError) && (
              <AgentStatusBadge status={hasRunning ? "running" : "error"} />
            )}
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {formatDate(thread.updatedAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {thread.lastMessagePreview}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {thread.messageCount > 0 && (
              <span className="shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                {thread.messageCount}
              </span>
            )}
            {isMobile && onOverflowMenu && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOverflowMenu(e);
                }}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ThreadList({
  threads,
  selectedThreadId,
  onSelectThread,
  onNewThread,
  onOpenMenu,
  onArchiveThread,
  statuses,
  unreadByThread,
  isMobile,
  workspaceName,
}: {
  threads: ThreadListItem[];
  selectedThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onOpenMenu?: () => void;
  onArchiveThread: (threadId: string, archived: boolean) => void;
  statuses: ThreadProcess[];
  unreadByThread?: Record<string, string[]>;
  isMobile?: boolean;
  workspaceName?: string;
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
    <div className="flex h-full w-full flex-col border-r border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
          {workspaceName || "Entourage"}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewThread}
            className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
          >
            + New
          </button>
          {isMobile && onOpenMenu && (
            <button
              onClick={onOpenMenu}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              title="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pt-3 pb-2 flex flex-col gap-1">
        {activeThreads.length === 0 && archivedThreads.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No threads yet. Create one to get started.
          </div>
        )}
        {activeThreads.map((thread) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            isSelected={thread.id === selectedThreadId}
            statuses={statuses}
            unreadByThread={unreadByThread}
            onSelect={() => onSelectThread(thread.id)}
            onContextMenu={(e) => handleContextMenu(e, thread)}
            onOverflowMenu={(e) => handleContextMenu(e, thread)}
            isMobile={isMobile}
          />
        ))}
        {archivedThreads.length > 0 && (
          <div className="mt-1">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl"
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
                  unreadByThread={unreadByThread}
                  onSelect={() => onSelectThread(thread.id)}
                  onContextMenu={(e) => handleContextMenu(e, thread)}
                  onOverflowMenu={(e) => handleContextMenu(e, thread)}
                  isMobile={isMobile}
                />
              ))}
          </div>
        )}
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
