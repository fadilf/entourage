"use client";

import { Message, Agent } from "@/lib/types";
import ModelIcon from "./ModelIcon";
import SlackMessage from "./SlackMessage";

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
}: {
  group: MessageGroupData;
  agent?: Agent;
  isUser: boolean;
  isStreaming: boolean;
  displayName?: string;
}) {
  const firstMessage = group.messages[0];

  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800 py-2 last:border-b-0">
      {/* Group header with avatar */}
      <div className="flex gap-3 px-5">
        {/* Avatar */}
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isUser ? "bg-zinc-900 dark:bg-zinc-600" : ""}`}
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
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {isUser ? displayName : agent?.name || "Unknown"}
            </span>
            {!isUser && agent?.model && (
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{agent.model}</span>
            )}
            {isStreaming && !isUser && (
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            )}
            <span className="text-[11px] text-zinc-400">
              {formatTime(firstMessage.timestamp)}
            </span>
          </div>
          <SlackMessage message={firstMessage} isUser={isUser} />
        </div>
      </div>

      {/* Subsequent messages in the group — indented past avatar */}
      {group.messages.slice(1).map((message) => (
        <div key={message.id} className="flex gap-3 px-5">
          {/* Spacer matching avatar width */}
          <div className="w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <SlackMessage message={message} isUser={isUser} />
          </div>
        </div>
      ))}
    </div>
  );
}
