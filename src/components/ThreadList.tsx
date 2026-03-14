import { Thread } from "@/data/threads";
import ModelIcon from "./ModelIcon";

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
}: {
  threads: Thread[];
  selectedThreadId: string | null;
  onSelectThread: (id: string) => void;
}) {
  return (
    <div className="flex h-full w-[35%] min-w-[280px] flex-col border-r border-zinc-800">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-4">
        <h1 className="text-lg font-semibold text-zinc-100">Nexus</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.map((thread) => {
          const lastMessage = thread.messages[thread.messages.length - 1];
          const isSelected = thread.id === selectedThreadId;
          const firstParticipant = thread.participants[0];

          return (
            <button
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
              className={`flex w-full gap-3 px-5 py-3.5 text-left transition-colors hover:bg-zinc-800/40 ${
                isSelected ? "bg-zinc-800/60" : ""
              }`}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100"
                style={{ border: `1.5px solid ${firstParticipant.avatarColor}`, boxShadow: `inset 0 2px 6px ${firstParticipant.avatarColor}80` }}
              >
                {firstParticipant.model && (
                  <ModelIcon model={firstParticipant.model} className="h-5 w-5" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-100">
                    {thread.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-zinc-500">
                    {formatDate(lastMessage.timestamp)}
                  </span>
                </div>
                <span className="truncate text-xs text-zinc-500">
                  {thread.participants.map((p) => p.name).join(", ")}
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-zinc-500">
                    {lastMessage.content}
                  </span>
                  <span className="shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    {thread.messages.length}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
