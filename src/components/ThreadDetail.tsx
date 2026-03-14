import { Thread, User, ME } from "@/data/threads";
import MessageBubble from "./MessageBubble";
import ModelIcon from "./ModelIcon";

function resolveUser(senderId: string, thread: Thread): User {
  if (senderId === ME.id) return ME;
  return thread.participants.find((u) => u.id === senderId) ?? ME;
}

export default function ThreadDetail({ thread }: { thread: Thread | null }) {
  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-400">
        Select a thread to view
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-zinc-200 px-6 py-4">
        <h2 className="text-sm font-medium text-zinc-900">{thread.title}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {thread.participants.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs"
            >
              {p.model && (
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-100"
                  style={{ border: `1.5px solid ${p.avatarColor}`, boxShadow: `inset 0 1px 4px ${p.avatarColor}80` }}
                >
                  <ModelIcon model={p.model} className="h-2.5 w-2.5" />
                </span>
              )}
              <span className="text-zinc-700">{p.name}</span>
              {p.model && (
                <span className="text-zinc-500">· {p.model}</span>
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {thread.messages.map((message) => {
          const user = resolveUser(message.senderId, thread);
          return (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.senderId === ME.id}
              senderName={user.name}
              avatarColor={user.avatarColor}
              model={user.model}
            />
          );
        })}
      </div>
    </div>
  );
}
