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
}: {
  group: MessageGroupData;
  agent?: Agent;
  isUser: boolean;
  isStreaming: boolean;
}) {
  const firstMessage = group.messages[0];

  return (
    <div className="border-b border-zinc-100 py-2 last:border-b-0">
      {/* Group header with avatar */}
      <div className="flex gap-3 px-4">
        {/* Avatar */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={
            isUser
              ? { backgroundColor: "#18181b" }
              : { backgroundColor: agent?.avatarColor || "#71717a" }
          }
        >
          {isUser ? (
            <span className="text-xs font-semibold text-white">F</span>
          ) : agent ? (
            <ModelIcon
              model={agent.model}
              icon={agent.icon}
              className="h-4 w-4 text-white"
            />
          ) : (
            <span className="text-xs font-semibold text-white">?</span>
          )}
        </div>

        {/* Name + timestamp + first message */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-zinc-900">
              {isUser ? "Fadil" : agent?.name || "Unknown"}
            </span>
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
        <div key={message.id} className="flex gap-3 px-4">
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
