"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ThreadListItem, ThreadWithMessages, ThreadProcess, Agent } from "@/lib/types";
import { useAgentStream } from "@/hooks/useSSE";
import ThreadList from "@/components/ThreadList";
import ThreadDetail from "@/components/ThreadDetail";
import NewThreadDialog from "@/components/NewThreadDialog";
import SettingsDialog from "@/components/SettingsDialog";

function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    fetch(url, { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => { if (!ac.signal.aborted) setData(d); })
      .catch(() => {});
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  const refetch = useCallback(() => {
    if (!url) return;
    fetch(url)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [url]);

  return [data, setData, refetch] as const;
}

export default function Home() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ThreadProcess[]>([]);
  const [showNewThread, setShowNewThread] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const prevIsStreaming = useRef(false);

  const [config, , refetchConfig] = useFetch<{ agents: Agent[] }>("/api/config");
  const agents = config?.agents ?? [];

  const [threads, , refetchThreads] = useFetch<ThreadListItem[]>("/api/threads");
  const threadList = threads ?? [];

  const threadUrl = selectedThreadId ? `/api/threads/${selectedThreadId}` : null;
  const [selectedThread, setSelectedThread, refetchThread] = useFetch<ThreadWithMessages>(threadUrl);

  const { streamingMessages, isStreaming, sendMessage, stopAgent } = useAgentStream(selectedThreadId);

  // Poll statuses
  useEffect(() => {
    const poll = () => {
      fetch("/api/threads/status")
        .then((r) => r.json())
        .then(setStatuses)
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, []);

  // Refresh after streaming completes
  useEffect(() => {
    if (prevIsStreaming.current && !isStreaming) {
      refetchThread();
      refetchThreads();
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming, refetchThread, refetchThreads]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!selectedThreadId || !selectedThread) return;

      const res = await fetch(`/api/threads/${selectedThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) return;

      const { message, targetAgents } = await res.json();

      // Update local state immediately
      setSelectedThread((prev) =>
        prev ? { ...prev, messages: [...prev.messages, message] } : prev
      );

      // Start streaming for target agents
      sendMessage(content, targetAgents);
    },
    [selectedThreadId, selectedThread, sendMessage, setSelectedThread]
  );

  const handleRenameThread = useCallback(
    async (title: string) => {
      if (!selectedThreadId) return;
      const res = await fetch(`/api/threads/${selectedThreadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setSelectedThread((prev) => (prev ? { ...prev, title: updated.title } : prev));
      refetchThreads();
    },
    [selectedThreadId, setSelectedThread, refetchThreads]
  );

  const handleArchiveThread = useCallback(
    async (threadId: string, archived: boolean) => {
      const res = await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) return;
      refetchThreads();
      if (archived && selectedThreadId === threadId) {
        setSelectedThreadId(null);
      }
    },
    [refetchThreads, selectedThreadId]
  );

  const handleThreadCreated = useCallback(
    (thread: ThreadWithMessages) => {
      refetchThreads();
      setSelectedThreadId(thread.id);
    },
    [refetchThreads]
  );

  return (
    <div className="flex h-screen bg-white text-zinc-900">
      <ThreadList
        threads={threadList}
        selectedThreadId={selectedThreadId}
        onSelectThread={setSelectedThreadId}
        onNewThread={() => setShowNewThread(true)}
        onOpenSettings={() => setShowSettings(true)}
        onArchiveThread={handleArchiveThread}
        statuses={statuses}
      />
      <ThreadDetail
        thread={selectedThread}
        streamingMessages={streamingMessages}
        onSendMessage={handleSendMessage}
        onStop={stopAgent}
        onRenameThread={handleRenameThread}
        isStreaming={isStreaming}
      />
      <NewThreadDialog
        open={showNewThread}
        agents={agents}
        onClose={() => setShowNewThread(false)}
        onCreated={handleThreadCreated}
      />
      <SettingsDialog
        open={showSettings}
        onClose={() => {
          setShowSettings(false);
          refetchConfig();
        }}
      />
    </div>
  );
}
