"use client";

import { Message, Agent } from "@/lib/types";
import ModelIcon from "./ModelIcon";
import ChatMessage from "./ChatMessage";

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type MessageGroupData = {
  senderId: string; // agentId or "user"
  messages: Message[];
};

export default function MessageGroup({
  group,
  agent,
  isUser,
  isStreaming,
  displayName = "You",
  onContextMenu,
}: {
  group: MessageGroupData;
  agent?: Agent;
  isUser: boolean;
  isStreaming: boolean;
  displayName?: string;
  onContextMenu?: (message: Message, x: number, y: number) => void;
}) {
  const firstMessage = group.messages[0];

  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800 py-1.5 last:border-b-0">
      {/* Group header with avatar */}
      <div className="flex gap-2.5 px-4">
        {/* Avatar */}
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${isUser ? "bg-zinc-900 dark:bg-zinc-600" : ""}`}
          style={
            isUser
              ? undefined
              : {
                  backgroundColor: "var(--background)",
                  border: `1.5px solid ${agent?.avatarColor || "#71717a"}`,
                  boxShadow: `inset 0 2px 6px ${(agent?.avatarColor || "#71717a")}80`,
                }
          }
        >
          {isUser ? (
            <span className="text-xs font-semibold text-white">{displayName.charAt(0).toUpperCase()}</span>
          ) : agent ? (
            <ModelIcon
              model={agent.model}
              icon={agent.icon}
              className="h-4 w-4"
            />
          ) : (
            <span className="text-xs font-semibold text-zinc-400">?</span>
          )}
        </div>

        {/* Name + timestamp + first message */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              {isUser ? displayName : agent?.name || "Unknown"}
            </span>
            {!isUser && agent?.model && (
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{agent.model}</span>
            )}
            {isStreaming && !isUser && (
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            )}
            <span className="text-[11px] text-zinc-400">
              {formatTime(firstMessage.timestamp)}
            </span>
          </div>
          <ChatMessage
            message={firstMessage}
            isUser={isUser}
            onContextMenu={onContextMenu}
          />
        </div>
      </div>

      {/* Subsequent messages in the group — indented past avatar */}
      {group.messages.slice(1).map((message) => (
        <div key={message.id} className="flex gap-2.5 px-4">
          {/* Spacer matching avatar width */}
          <div className="w-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <ChatMessage
              message={message}
              isUser={isUser}
              onContextMenu={onContextMenu}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
