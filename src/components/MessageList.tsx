"use client";

import { Message, Agent } from "@/lib/types";
import MessageGroup, { MessageGroupData } from "./MessageGroup";

const GROUP_GAP_MS = 5 * 60 * 1000; // 5 minutes

export function groupMessages(messages: Message[]): MessageGroupData[] {
  const groups: MessageGroupData[] = [];

  for (const message of messages) {
    const senderId = message.role === "user" ? "user" : (message.agentId || "unknown");
    const lastGroup = groups[groups.length - 1];

    const timeDiff = lastGroup
      ? new Date(message.timestamp).getTime() -
        new Date(lastGroup.messages[lastGroup.messages.length - 1].timestamp).getTime()
      : Infinity;

    if (lastGroup && lastGroup.senderId === senderId && timeDiff < GROUP_GAP_MS) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ senderId, messages: [message] });
    }
  }

  return groups;
}

export default function MessageList({
  messages,
  agents,
  displayName,
  onContextMenu,
}: {
  messages: Message[];
  agents: Agent[];
  displayName?: string;
  onContextMenu?: (message: Message, x: number, y: number) => void;
}) {
  const groups = groupMessages(messages);

  return (
    <>
      {groups.map((group) => {
        const isUser = group.senderId === "user";
        const agent = isUser
          ? undefined
          : agents.find((a) => a.id === group.senderId);
        const isStreaming = !isUser && group.messages.some(
          (m) => m.status === "streaming"
        );

        return (
          <MessageGroup
            key={`${group.senderId}-${group.messages[0].id}`}
            group={group}
            agent={agent}
            isUser={isUser}
            isStreaming={isStreaming}
            displayName={displayName}
            onContextMenu={onContextMenu}
          />
        );
      })}
    </>
  );
}
