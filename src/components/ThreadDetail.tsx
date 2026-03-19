"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ThreadWithMessages, Agent, Message, MessageImage } from "@/lib/types";
import { ChevronLeft, Copy, Pencil, RotateCcw, Send } from "lucide-react";
import Dialog from "./Dialog";
import MessageList from "./MessageList";
import ModelIcon from "./ModelIcon";
import MessageInput from "./MessageInput";
import QuickReplies from "./QuickReplies";
import ContextMenu from "./ContextMenu";

export default function ThreadDetail({
  thread,
  streamingMessages,
  onSendMessage,
  onStop,
  onRenameThread,
  isStreaming,
  allAgents,
  displayName,
  isMobile,
  onBack,
  onRewind,
  onResendMessage,
  suggestions,
  suggestionsLoading,
  onSuggestionSelect,
  onDraftChange,
}: {
  thread: ThreadWithMessages | null;
  streamingMessages: Map<string, { agentId: string; content: string; toolCalls?: import("@/lib/types").ToolCall[]; contentBlocks?: import("@/lib/types").ContentBlock[]; isReattach?: boolean }>;
  onSendMessage: (content: string, images?: MessageImage[]) => void;
  onStop: (agentId: string) => void;
  onRenameThread?: (title: string) => void;
  isStreaming: boolean;
  allAgents?: Agent[];
  displayName?: string;
  isMobile?: boolean;
  onBack?: () => void;
  onRewind?: (messageId: string, options?: { keepMessage?: boolean }) => void;
  onResendMessage?: (message: Message) => void;
  suggestions?: string[];
  suggestionsLoading?: boolean;
  onSuggestionSelect?: (text: string) => void;
  onDraftChange?: (hasText: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
  const [rewindConfirm, setRewindConfirm] = useState<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 80;
      isNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Derive a primitive value from streamingMessages to avoid re-firing on reference changes
  const streamingContentKey = Array.from(streamingMessages.values())
    .map((s) => s.content.length)
    .join(",");

  useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread?.messages.length, streamingContentKey]);

  const handleContextMenu = useCallback((message: Message, x: number, y: number) => {
    setContextMenu({ x, y, message });
  }, []);

  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-400 dark:text-zinc-500">
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
      content: data.content.replace(/<QuickReply>[\s\S]*$/,  "").trimEnd(),
      timestamp: new Date().toISOString(),
      status: "streaming" as const,
      ...(data.toolCalls?.length ? { toolCalls: data.toolCalls } : {}),
      ...(data.contentBlocks?.length ? { contentBlocks: data.contentBlocks.map(b =>
        b.type === "text" ? { ...b, text: b.text.replace(/<QuickReply>[\s\S]*$/, "").trimEnd() } : b
      ) } : {}),
      ...(data.isReattach ? { isReattach: true } : {}),
    })
  );

  // When reattaching, replace the persisted streaming message with the live one
  const streamingAgentIds = new Set(streamingMessages.keys());
  const filteredMessages = thread.messages.filter(
    (m) => !(m.status === "streaming" && m.agentId && streamingAgentIds.has(m.agentId))
  );
  const allMessages = [...filteredMessages, ...streamingMsgs];
  const hasQuickReplies = (suggestions?.length ?? 0) > 0 || !!suggestionsLoading;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className={`border-b border-zinc-200 dark:border-zinc-700 ${isMobile ? "px-4" : "px-6"} py-4`}>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="shrink-0 -ml-1 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
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
              className="w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-sm font-medium text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400"
            />
          ) : (
            <>
              <h2
                className={`text-sm font-medium text-zinc-900 dark:text-zinc-100 ${isMobile ? "truncate" : "cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300"}`}
                onDoubleClick={isMobile ? undefined : () => {
                  setEditTitle(thread.title);
                  setIsEditingTitle(true);
                  setTimeout(() => titleInputRef.current?.select(), 0);
                }}
                title={isMobile ? undefined : "Double-click to rename"}
              >
                {thread.title}
              </h2>
              {isMobile && (
                <button
                  onClick={() => {
                    setEditTitle(thread.title);
                    setIsEditingTitle(true);
                    setTimeout(() => titleInputRef.current?.select(), 0);
                  }}
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {thread.agents.map((agent) => (
            <span
              key={agent.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs dark:bg-zinc-800"
            >
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800"
                style={{ border: `1.5px solid ${agent.avatarColor}`, boxShadow: `inset 0 1px 4px ${agent.avatarColor}80` }}
              >
                <ModelIcon model={agent.model} icon={agent.icon} className="h-2.5 w-2.5" />
              </span>
              <span className="text-zinc-700 dark:text-zinc-300">{agent.name}</span>
              <span className="text-zinc-500 dark:text-zinc-400">· {agent.model}</span>
            </span>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="flex flex-1 flex-col overflow-y-auto py-2">
        <MessageList
          messages={allMessages}
          agents={thread.agents}
          displayName={displayName}
          onContextMenu={handleContextMenu}
        />
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-700">
        <QuickReplies
          suggestions={suggestions ?? []}
          loading={suggestionsLoading ?? false}
          onSelect={(text) => onSuggestionSelect?.(text)}
          className={`${isMobile ? "px-4" : "px-6"} pt-2 pb-0.5`}
        />
        <MessageInput
          key={thread.id}
          agents={thread.agents}
          allAgents={allAgents}
          onSendMessage={onSendMessage}
          onStop={onStop}
          disabled={isStreaming}
          isMobile={isMobile}
          onDraftChange={onDraftChange}
          showTopBorder={false}
          compactTopPadding={hasQuickReplies}
        />
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: "Copy message",
              icon: <Copy className="h-4 w-4" />,
              onClick: () => navigator.clipboard.writeText(contextMenu.message.content),
            },
            ...(contextMenu.message.role === "user"
              ? [{
                  label: "Re-send message",
                  icon: <Send className="h-4 w-4" />,
                  onClick: () => onResendMessage?.(contextMenu.message),
                  disabled: isStreaming,
                  disabledReason: "Can't re-send while an agent is running",
                }]
              : []),
            {
              label: "Rewind messages to here",
              icon: <RotateCcw className="h-4 w-4" />,
              onClick: () => setRewindConfirm(contextMenu.message.id),
              disabled: isStreaming,
              disabledReason: "Can't rewind while an agent is running",
            },
          ]}
        />
      )}
      {rewindConfirm && (
        <Dialog open={!!rewindConfirm} onClose={() => setRewindConfirm(null)}>
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Rewind conversation?</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Messages after this point will be permanently deleted.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRewindConfirm(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRewind?.(rewindConfirm);
                  setRewindConfirm(null);
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Rewind
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
