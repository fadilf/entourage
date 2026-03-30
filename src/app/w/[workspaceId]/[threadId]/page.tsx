"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ThreadWithMessages, Message, MessageImage, PermissionLevel } from "@/lib/types";
import { useFetch } from "@/hooks/useFetch";
import { useAgentStream } from "@/hooks/useSSE";
import { useWorkspaceLayout } from "@/contexts/WorkspaceLayoutContext";
import ThreadDetail from "@/components/ThreadDetail";

export default function ThreadPage() {
  const { threadId, workspaceId } = useParams<{ threadId: string; workspaceId: string }>();
  const router = useRouter();
  const {
    wsUrl,
    agents,
    displayName,
    userIcon,
    userColor,
    quickRepliesEnabled,
    refetchThreads,
    threads,
    activeWorkspace,
    isMobile,
  } = useWorkspaceLayout();

  const streamCompleteThreadId = useRef<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Fetch thread data
  const threadUrl = wsUrl(`/api/threads/${threadId}`);
  const [selectedThread, setSelectedThread, refetchThread, threadError] =
    useFetch<ThreadWithMessages>(threadUrl);

  // Redirect on 404
  useEffect(() => {
    if (threadError && threadError.includes("404")) {
      router.replace(`/w/${workspaceId}`);
    }
  }, [threadError, router, workspaceId]);

  // Document title
  useEffect(() => {
    if (selectedThread?.title && activeWorkspace?.name) {
      document.title = `${selectedThread.title} — ${activeWorkspace.name} | Entourage`;
    }
  }, [selectedThread?.title, activeWorkspace?.name]);

  // Suggestions
  const handleInlineSuggestions = useCallback((inlineSuggestions: string[]) => {
    if (inlineSuggestions.length > 0) {
      setSuggestions(inlineSuggestions);
    }
  }, []);

  const handleStreamComplete = useCallback(
    (completedThreadId: string) => {
      streamCompleteThreadId.current = completedThreadId;
      refetchThreads();
      if (completedThreadId === threadId) {
        refetchThread();
      }
    },
    [threadId, refetchThread, refetchThreads]
  );

  const { streamingMessages, isStreaming, sendMessage, stopAgent, reattach, autoDispatchPaused, resetAutoDispatch } =
    useAgentStream(threadId, handleStreamComplete, workspaceId, handleInlineSuggestions);

  // Re-attach to streams on mount
  useEffect(() => {
    if (!selectedThread) return;
    const pendingStreams = selectedThread.messages.filter(
      (m) => m.status === "streaming" && m.agentId
    );
    for (const msg of pendingStreams) {
      reattach(selectedThread.id, msg.agentId!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThread?.id, reattach]);

  // When switching to a thread that just completed streaming, refetch
  useEffect(() => {
    if (
      streamCompleteThreadId.current &&
      streamCompleteThreadId.current === threadId
    ) {
      streamCompleteThreadId.current = null;
      refetchThread();
    }
  }, [threadId, refetchThread]);

  // Restore persisted suggestions once when thread first loads
  const lastRestoredThreadId = useRef<string | null>(null);

  useEffect(() => {
    setSuggestions([]);
    lastRestoredThreadId.current = null;
  }, [threadId]);

  useEffect(() => {
    if (!selectedThread || lastRestoredThreadId.current === selectedThread.id) return;
    lastRestoredThreadId.current = selectedThread.id;
    const lastAssistant = [...selectedThread.messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.status === "complete");
    const persisted = lastAssistant?.suggestions ?? [];
    if (persisted.length > 0) {
      setSuggestions(persisted);
    }
  }, [selectedThread]);

  // Clear unread on mount
  useEffect(() => {
    fetch(wsUrl(`/api/threads/${threadId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearUnread: true }),
    }).catch(() => {});
  }, [threadId, wsUrl]);

  // Permission level
  const effectivePermissionLevel: PermissionLevel =
    selectedThread?.permissionLevel ?? activeWorkspace?.permissionLevel ?? "full";

  const handleChangePermissionLevel = useCallback(
    async (level: PermissionLevel) => {
      const res = await fetch(wsUrl(`/api/threads/${threadId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionLevel: level }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setSelectedThread((prev) =>
        prev ? { ...prev, permissionLevel: updated.permissionLevel } : prev
      );
    },
    [threadId, setSelectedThread, wsUrl]
  );

  const handleChangeCoordinator = useCallback(
    async (agentId: string | null) => {
      const res = await fetch(wsUrl(`/api/threads/${threadId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinatorId: agentId }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setSelectedThread((prev) =>
        prev ? { ...prev, coordinatorId: updated.coordinatorId } : prev
      );
    },
    [threadId, setSelectedThread, wsUrl]
  );

  const handleChangeMaxAutoDispatches = useCallback(
    async (limit: number) => {
      const res = await fetch(wsUrl(`/api/threads/${threadId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxAutoDispatches: limit }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setSelectedThread((prev) =>
        prev ? { ...prev, maxAutoDispatches: updated.maxAutoDispatches } : prev
      );
    },
    [threadId, setSelectedThread, wsUrl]
  );

  const handleDraftChange = useCallback((hasText: boolean) => {
    if (hasText) {
      setSuggestions((prev) => (prev.length === 0 ? prev : []));
    }
  }, []);

  // Send message
  const sendUserMessage = useCallback(
    async (content: string, images?: MessageImage[], attachedThreads?: { id: string; title: string }[]) => {
      const res = await fetch(wsUrl(`/api/threads/${threadId}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          ...(images && images.length > 0 ? { images } : {}),
          ...(attachedThreads && attachedThreads.length > 0 ? { attachedThreads } : {}),
        }),
      });

      if (!res.ok) return false;

      const { message, targetAgents, threadUpdated, thread } = await res.json();

      setSelectedThread((prev) =>
        prev
          ? {
              ...prev,
              messages: [...prev.messages, message],
              agents: thread?.agents ?? prev.agents,
              updatedAt: thread?.updatedAt ?? prev.updatedAt,
            }
          : prev
      );

      if (threadUpdated) {
        refetchThreads();
      }

      const attachedThreadIds = attachedThreads?.map((t) => t.id);
      sendMessage(content, targetAgents, images, attachedThreadIds);
      return true;
    },
    [threadId, sendMessage, setSelectedThread, refetchThreads, wsUrl]
  );

  const handleSendMessage = useCallback(
    async (content: string, images?: MessageImage[], attachedThreads?: { id: string; title: string }[]) => {
      setSuggestions([]);
      await sendUserMessage(content, images, attachedThreads);
    },
    [sendUserMessage]
  );

  // Rename
  const handleRenameThread = useCallback(
    async (title: string) => {
      const res = await fetch(wsUrl(`/api/threads/${threadId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setSelectedThread((prev) => (prev ? { ...prev, title: updated.title } : prev));
      refetchThreads();
    },
    [threadId, setSelectedThread, refetchThreads, wsUrl]
  );

  // Rewind
  const rewindThread = useCallback(
    async (messageId: string, keepMessage = true, revertCode = false) => {
      const res = await fetch(wsUrl(`/api/threads/${threadId}/rewind`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, keepMessage, revertCode }),
      });
      if (!res.ok) return null;
      const updated = await res.json();
      setSelectedThread(updated);
      refetchThreads();
      return updated as ThreadWithMessages;
    },
    [threadId, setSelectedThread, refetchThreads, wsUrl]
  );

  const handleRewind = useCallback(
    async (messageId: string, options?: { keepMessage?: boolean; revertCode?: boolean }) => {
      await rewindThread(messageId, options?.keepMessage ?? true, options?.revertCode ?? false);
    },
    [rewindThread]
  );

  // Resend
  const handleResendMessage = useCallback(
    async (message: Message) => {
      if (message.role !== "user") return;
      setSuggestions([]);
      const rewound = await rewindThread(message.id, false);
      if (!rewound) return;
      await sendUserMessage(message.content, message.images, message.attachedThreads);
    },
    [rewindThread, sendUserMessage]
  );

  // Edit – rewind to before message, return true so ThreadDetail can load the draft
  const handleEditMessage = useCallback(
    async (message: Message): Promise<boolean> => {
      if (message.role !== "user") return false;
      setSuggestions([]);
      const rewound = await rewindThread(message.id, false);
      return !!rewound;
    },
    [rewindThread]
  );

  return (
    <ThreadDetail
      thread={selectedThread}
      streamingMessages={streamingMessages}
      onSendMessage={handleSendMessage}
      onStop={stopAgent}
      onRenameThread={handleRenameThread}
      onRewind={handleRewind}
      onResendMessage={handleResendMessage}
      onEditMessage={handleEditMessage}
      isStreaming={isStreaming}
      allAgents={agents}
      displayName={displayName}
      userIcon={userIcon}
      userColor={userColor}
      isMobile={isMobile}
      onBack={isMobile ? () => router.back() : undefined}
      suggestions={quickRepliesEnabled && !isStreaming ? suggestions : []}
      onSuggestionSelect={(text: string) => {
        setSuggestions([]);
        handleSendMessage(text);
      }}
      onDraftChange={handleDraftChange}
      permissionLevel={effectivePermissionLevel}
      onChangePermissionLevel={handleChangePermissionLevel}
      workspaceThreads={threads.length > 0 ? threads : undefined}
      // TODO: re-enable coordinator after next release
      // coordinatorId={selectedThread?.coordinatorId ?? null}
      // onChangeCoordinator={handleChangeCoordinator}
      // maxAutoDispatches={selectedThread?.maxAutoDispatches}
      // onChangeMaxAutoDispatches={handleChangeMaxAutoDispatches}
      // autoDispatchPaused={autoDispatchPaused}
      // onResumeAutoDispatch={resetAutoDispatch}
    />
  );
}
