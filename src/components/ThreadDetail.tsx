"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThreadWithMessages, Agent, Message, MessageImage, Icon, PermissionLevel, ThreadListItem } from "@/lib/types";
import { ChevronLeft, Copy, Pencil, RotateCcw, Send, ShieldCheck, ShieldAlert, Shield, RefreshCw, Repeat } from "lucide-react";
import Dialog from "./Dialog";
import MessageList from "./MessageList";
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
  userIcon,
  userColor,
  isMobile,
  onBack,
  onRewind,
  onResendMessage,
  onEditMessage,
  suggestions,
  onSuggestionSelect,
  onDraftChange,
  permissionLevel,
  onChangePermissionLevel,
  workspaceThreads,
  coordinatorId,
  onChangeCoordinator,
  maxAutoDispatches,
  onChangeMaxAutoDispatches,
  autoDispatchPaused,
  onResumeAutoDispatch,
}: {
  thread: ThreadWithMessages | null;
  streamingMessages: Map<string, { agentId: string; content: string; toolCalls?: import("@/lib/types").ToolCall[]; contentBlocks?: import("@/lib/types").ContentBlock[]; isReattach?: boolean }>;
  onSendMessage: (content: string, images?: MessageImage[], attachedThreads?: { id: string; title: string }[]) => void;
  onStop: (agentId: string) => void;
  onRenameThread?: (title: string) => void;
  isStreaming: boolean;
  allAgents?: Agent[];
  displayName?: string;
  userIcon?: Icon;
  userColor?: string;
  isMobile?: boolean;
  onBack?: () => void;
  onRewind?: (messageId: string, options?: { keepMessage?: boolean; revertCode?: boolean }) => Promise<void> | void;
  onResendMessage?: (message: Message) => void;
  onEditMessage?: (message: Message) => Promise<boolean>;
  suggestions?: string[];
  onSuggestionSelect?: (text: string) => void;
  onDraftChange?: (hasText: boolean) => void;
  permissionLevel?: PermissionLevel;
  onChangePermissionLevel?: (level: PermissionLevel) => void;
  workspaceThreads?: ThreadListItem[];
  coordinatorId?: string | null;
  onChangeCoordinator?: (agentId: string | null) => void;
  maxAutoDispatches?: number;
  onChangeMaxAutoDispatches?: (limit: number) => void;
  autoDispatchPaused?: boolean;
  onResumeAutoDispatch?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
  const [rewindConfirm, setRewindConfirm] = useState<string | null>(null);
  const [revertCode, setRevertCode] = useState(false);
  const [showPermDropdown, setShowPermDropdown] = useState(false);
  const [showCoordDropdown, setShowCoordDropdown] = useState(false);
  const [editDraft, setEditDraft] = useState<string | null>(null);

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

  // Derive a primitive key from streaming state to detect content, tool call, and block changes
  // (streamingMessages is a ref-backed Map whose reference never changes)
  const streamingStateKey = Array.from(streamingMessages.values())
    .map((s) => `${s.content.length}:${s.toolCalls?.length ?? 0}:${s.contentBlocks?.length ?? 0}`)
    .join(",");

  useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread?.messages.length, streamingStateKey]);

  const handleContextMenu = useCallback((message: Message, x: number, y: number) => {
    setContextMenu({ x, y, message });
  }, []);

  // Build streaming messages as Message objects for display
  const allMessages = useMemo(() => {
    if (!thread) return [];
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
    return [...filteredMessages, ...streamingMsgs];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread, streamingStateKey]);

  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-400 dark:text-zinc-500">
        Select a thread to view
      </div>
    );
  }

  const hasQuickReplies = (suggestions?.length ?? 0) > 0;

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
          <h2
            ref={titleRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            className={`text-lg font-semibold text-zinc-900 dark:text-zinc-100 outline-none ${isMobile ? "truncate" : "cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300"} focus:cursor-text focus:hover:text-zinc-900 dark:focus:hover:text-zinc-100`}
            onBlur={(e) => {
              const trimmed = (e.currentTarget.textContent || "").trim();
              if (trimmed && trimmed !== thread.title) {
                onRenameThread?.(trimmed);
              } else {
                e.currentTarget.textContent = thread.title;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.currentTarget.textContent = thread.title;
                e.currentTarget.blur();
              }
            }}
            title={isMobile ? undefined : "Double-click to rename"}
          >
            {thread.title}
          </h2>
          {isMobile && (
            <button
              onClick={() => {
                const el = titleRef.current;
                if (!el) return;
                el.focus();
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
              }}
              className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Permission level indicator */}
          {permissionLevel && onChangePermissionLevel && (
            <div className="relative ml-auto shrink-0">
              <button
                onClick={() => setShowPermDropdown((v) => !v)}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  permissionLevel === "full"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    : permissionLevel === "auto-edit"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                }`}
                title="Change permission level for this thread"
              >
                {permissionLevel === "full" ? (
                  <ShieldCheck className="h-3 w-3" />
                ) : permissionLevel === "auto-edit" ? (
                  <Shield className="h-3 w-3" />
                ) : (
                  <ShieldAlert className="h-3 w-3" />
                )}
                {permissionLevel === "full" ? "Full Autonomy" : permissionLevel === "auto-edit" ? "Auto-Edit" : "Supervised"}
              </button>
              {showPermDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPermDropdown(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                    {(["supervised", "auto-edit", "full"] as PermissionLevel[]).map((level) => (
                      <button
                        key={level}
                        onClick={() => {
                          onChangePermissionLevel(level);
                          setShowPermDropdown(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                          permissionLevel === level ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {level === "full" ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        ) : level === "auto-edit" ? (
                          <Shield className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                        )}
                        <div className="text-left">
                          <div>{level === "full" ? "Full Autonomy" : level === "auto-edit" ? "Auto-Edit" : "Supervised"}</div>
                          <div className="text-[10px] font-normal text-zinc-400">
                            {level === "full" ? "All actions allowed" : level === "auto-edit" ? "Edits ok, no shell" : "Read-only"}
                          </div>
                        </div>
                        {permissionLevel === level && <span className="ml-auto text-violet-600">&#10003;</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {/* Coordinator setting */}
          {onChangeCoordinator && thread.agents.length > 0 && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowCoordDropdown((v) => !v)}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  coordinatorId
                    ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
                title="Set a coordinator agent for auto-dispatch loops"
              >
                <Repeat className="h-3 w-3" />
                {coordinatorId
                  ? thread.agents.find((a) => a.id === coordinatorId)?.name ?? "Coordinator"
                  : "No Coordinator"}
              </button>
              {showCoordDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCoordDropdown(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg">
                    <button
                      onClick={() => {
                        onChangeCoordinator(null);
                        setShowCoordDropdown(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                        !coordinatorId ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      <div className="text-left">
                        <div>None</div>
                        <div className="text-[10px] font-normal text-zinc-400">Multi-mentions dispatch in parallel</div>
                      </div>
                      {!coordinatorId && <span className="ml-auto text-violet-600">&#10003;</span>}
                    </button>
                    <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />
                    {thread.agents.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          onChangeCoordinator(a.id);
                          setShowCoordDropdown(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                          coordinatorId === a.id ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        <div
                          className="h-3 w-3 rounded-full border"
                          style={{ borderColor: a.avatarColor, backgroundColor: coordinatorId === a.id ? a.avatarColor : "transparent" }}
                        />
                        <span>{a.name}</span>
                        {coordinatorId === a.id && <span className="ml-auto text-violet-600">&#10003;</span>}
                      </button>
                    ))}
                    {coordinatorId && onChangeMaxAutoDispatches && (
                      <>
                        <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />
                        <div className="flex items-center gap-2 px-3 py-1.5">
                          <span className="text-[10px] text-zinc-400">Loop limit</span>
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={maxAutoDispatches ?? 50}
                            onChange={(e) => onChangeMaxAutoDispatches(parseInt(e.target.value) || 50)}
                            className="w-16 rounded border border-zinc-200 dark:border-zinc-600 bg-transparent px-1.5 py-0.5 text-[11px] text-zinc-700 dark:text-zinc-300"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Auto-dispatch paused banner */}
      {autoDispatchPaused && onResumeAutoDispatch && (
        <div className="flex items-center gap-2 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-6 py-2">
          <span className="text-xs text-amber-700 dark:text-amber-400">Auto-dispatch loop paused — iteration limit reached.</span>
          <button
            onClick={onResumeAutoDispatch}
            className="flex items-center gap-1 rounded-md bg-amber-200 dark:bg-amber-800 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-700"
          >
            <RefreshCw className="h-3 w-3" />
            Resume
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex flex-1 flex-col overflow-y-auto pt-3 pb-2">
        <MessageList
          messages={allMessages}
          agents={thread.agents}
          displayName={displayName}
          userIcon={userIcon}
          userColor={userColor}
          onContextMenu={handleContextMenu}
          permissionLevel={permissionLevel}
          onChangePermissionLevel={onChangePermissionLevel}
        />
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-700">
        <QuickReplies
          suggestions={suggestions ?? []}
          loading={false}
          onSelect={(text) => onSuggestionSelect?.(text)}
          onEdit={(text) => setEditDraft(text)}
          className={`${isMobile ? "px-4" : "px-6"} pt-2 pb-0.5`}
        />
        <MessageInput
          key={thread.id}
          threadId={thread.id}
          agents={thread.agents}
          allAgents={allAgents}
          onSendMessage={onSendMessage}
          onStop={onStop}
          disabled={isStreaming}
          isMobile={isMobile}
          onDraftChange={onDraftChange}
          showTopBorder={false}
          compactTopPadding={hasQuickReplies}
          workspaceThreads={workspaceThreads}
          editDraft={editDraft}
          onEditDraftConsumed={() => setEditDraft(null)}
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
              onClick: () => {
                navigator.clipboard.writeText(contextMenu.message.content).catch(() => {
                  // Fallback for browsers that block clipboard API (e.g. mobile without secure context)
                  const textarea = document.createElement("textarea");
                  textarea.value = contextMenu.message.content;
                  textarea.style.position = "fixed";
                  textarea.style.opacity = "0";
                  document.body.appendChild(textarea);
                  textarea.select();
                  document.execCommand("copy");
                  document.body.removeChild(textarea);
                });
              },
            },
            ...(contextMenu.message.role === "user"
              ? [
                  {
                    label: "Edit message",
                    icon: <Pencil className="h-4 w-4" />,
                    onClick: async () => {
                      const msg = contextMenu.message;
                      const success = await onEditMessage?.(msg);
                      if (success) setEditDraft(msg.content);
                    },
                    disabled: isStreaming,
                    disabledReason: "Can't edit while an agent is running",
                  },
                  {
                    label: "Re-send message",
                    icon: <Send className="h-4 w-4" />,
                    onClick: () => onResendMessage?.(contextMenu.message),
                    disabled: isStreaming,
                    disabledReason: "Can't re-send while an agent is running",
                  },
                ]
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
      {rewindConfirm && (() => {
        const messages = allMessages;
        const hasSnapshots = messages
          .slice(messages.findIndex((m) => m.id === rewindConfirm) + 1)
          .some((m) => m.snapshotTreeHash);
        return (
          <Dialog open={!!rewindConfirm} onClose={() => { setRewindConfirm(null); setRevertCode(false); }}>
            <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-6 shadow-xl">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Rewind conversation?</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Messages after this point will be permanently deleted.
              </p>
              {hasSnapshots && (
                <label className="flex items-center gap-2 text-sm text-zinc-400 mt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={revertCode}
                    onChange={(e) => setRevertCode(e.target.checked)}
                    className="rounded border-zinc-600"
                  />
                  Also revert code changes
                </label>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => { setRewindConfirm(null); setRevertCode(false); }}
                  className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onRewind?.(rewindConfirm, { keepMessage: true, revertCode });
                    setRewindConfirm(null);
                    setRevertCode(false);
                  }}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  Rewind
                </button>
              </div>
            </div>
          </Dialog>
        );
      })()}
    </div>
  );
}
