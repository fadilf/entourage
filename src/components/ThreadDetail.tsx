"use client";

import { useEffect, useRef, useState } from "react";
import { ThreadWithMessages, Agent, Message } from "@/lib/types";
import MessageBubble from "./MessageBubble";
import ModelIcon from "./ModelIcon";
import MessageInput from "./MessageInput";

function resolveAgent(message: Message, agents: Agent[]): Agent | undefined {
  if (message.role === "user") return undefined;
  return agents.find((a) => a.id === message.agentId);
}

export default function ThreadDetail({
  thread,
  streamingMessages,
  onSendMessage,
  onStop,
  onRenameThread,
  isStreaming,
}: {
  thread: ThreadWithMessages | null;
  streamingMessages: Map<string, { agentId: string; content: string }>;
  onSendMessage: (content: string) => void;
  onStop: (agentId: string) => void;
  onRenameThread?: (title: string) => void;
  isStreaming: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread?.messages.length, streamingMessages]);

  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-400">
        Select a thread to view
      </div>
    );
  }

  // Build streaming messages as Message objects for display
  const streamingMsgs: Message[] = Array.from(streamingMessages.entries()).map(
    ([agentId, data]) => ({
      id: `streaming-${agentId}`,
      threadId: thread.id,
      role: "assistant" as const,
      agentId,
      content: data.content,
      timestamp: new Date().toISOString(),
      status: "streaming" as const,
    })
  );

  const allMessages = [...thread.messages, ...streamingMsgs];

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-zinc-200 px-6 py-4">
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => {
              const trimmed = editTitle.trim();
              if (trimmed && trimmed !== thread.title) {
                onRenameThread?.(trimmed);
              }
              setIsEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setIsEditingTitle(false);
              }
            }}
            className="w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-sm font-medium text-zinc-900 outline-none focus:border-zinc-500"
          />
        ) : (
          <h2
            className="cursor-pointer text-sm font-medium text-zinc-900 hover:text-zinc-600"
            onDoubleClick={() => {
              setEditTitle(thread.title);
              setIsEditingTitle(true);
              setTimeout(() => titleInputRef.current?.select(), 0);
            }}
            title="Double-click to rename"
          >
            {thread.title}
          </h2>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {thread.agents.map((agent) => (
            <span
              key={agent.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs"
            >
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-100"
                style={{ border: `1.5px solid ${agent.avatarColor}`, boxShadow: `inset 0 1px 4px ${agent.avatarColor}80` }}
              >
                <ModelIcon model={agent.model} icon={agent.icon} className="h-2.5 w-2.5" />
              </span>
              <span className="text-zinc-700">{agent.name}</span>
              <span className="text-zinc-500">· {agent.model}</span>
            </span>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {allMessages.map((message) => {
          const agent = resolveAgent(message, thread.agents);
          return (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.role === "user"}
              agentName={agent?.name}
              avatarColor={agent?.avatarColor}
              model={agent?.model}
              icon={agent?.icon}
            />
          );
        })}
      </div>
      <MessageInput
        agents={thread.agents}
        onSendMessage={onSendMessage}
        onStop={onStop}
        disabled={isStreaming}
      />
    </div>
  );
}
