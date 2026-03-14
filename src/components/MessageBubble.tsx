import { AgentModel, Message } from "@/data/threads";
import ModelIcon from "./ModelIcon";

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderContent(content: string, isOwn: boolean) {
  const parts = content.split(/(@\w+)/g);
  if (parts.length === 1) return content;
  return parts.map((part, i) =>
    /^@\w+/.test(part) ? (
      <span
        key={i}
        className={`font-medium ${
          isOwn ? "text-violet-200" : "text-violet-400"
        }`}
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function MessageBubble({
  message,
  isOwn,
  senderName,
  avatarColor,
  model,
}: {
  message: Message;
  isOwn: boolean;
  senderName: string;
  avatarColor: string;
  model?: AgentModel;
}) {
  const avatar = (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        model ? "bg-zinc-100" : "bg-violet-600 text-white"
      }`}
      style={model ? { border: `1.5px solid ${avatarColor}`, boxShadow: `inset 0 2px 6px ${avatarColor}80` } : undefined}
    >
      {model ? (
        <ModelIcon model={model} className="h-4 w-4" />
      ) : (
        <span className="text-xs font-semibold">Y</span>
      )}
    </div>
  );

  return (
    <div className={`flex gap-3 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
      {avatar}
      <div className={`flex max-w-[75%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && (
          <span className="mb-1 text-xs text-zinc-500">
            {senderName}
            {model && (
              <span className="ml-1 text-zinc-600">· {model}</span>
            )}
          </span>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isOwn
              ? "bg-violet-600 text-white"
              : "bg-zinc-800 text-zinc-100"
          }`}
        >
          {renderContent(message.content, isOwn)}
        </div>
        <span className="mt-1 text-[11px] text-zinc-600">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
