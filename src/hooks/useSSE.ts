"use client";

import { useState, useCallback, useRef } from "react";
import { Agent } from "@/lib/types";

type StreamingMessage = {
  agentId: string;
  content: string;
};

export function useAgentStream(threadId: string | null) {
  const [streamingMessages, setStreamingMessages] = useState<Map<string, StreamingMessage>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const isStreaming = streamingMessages.size > 0;

  const streamAgent = useCallback(
    async (agentId: string, prompt: string) => {
      if (!threadId) return;

      const controller = new AbortController();
      abortControllers.current.set(agentId, controller);

      setStreamingMessages((prev) => {
        const next = new Map(prev);
        next.set(agentId, { agentId, content: "" });
        return next;
      });

      try {
        const res = await fetch(`/api/threads/${threadId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, prompt }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);

            try {
              const event = JSON.parse(data);
              if (event.type === "content") {
                setStreamingMessages((prev) => {
                  const next = new Map(prev);
                  const existing = next.get(agentId);
                  next.set(agentId, {
                    agentId,
                    content: (existing?.content ?? "") + event.text,
                  });
                  return next;
                });
              } else if (event.type === "done") {
                break;
              } else if (event.type === "error") {
                setError(event.message);
              }
            } catch {
              // Not valid JSON
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        abortControllers.current.delete(agentId);
        setStreamingMessages((prev) => {
          const next = new Map(prev);
          next.delete(agentId);
          return next;
        });
      }
    },
    [threadId]
  );

  const sendMessage = useCallback(
    async (content: string, targetAgents: Agent[]) => {
      if (!threadId) return;
      setError(null);

      // Start streams for all target agents in parallel
      await Promise.all(
        targetAgents.map((agent) => streamAgent(agent.id, content))
      );
    },
    [threadId, streamAgent]
  );

  const stopAgent = useCallback(
    async (agentId: string) => {
      if (!threadId) return;
      // Abort the fetch
      abortControllers.current.get(agentId)?.abort();
      // Tell server to kill the process
      await fetch(`/api/threads/${threadId}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
    },
    [threadId]
  );

  return {
    streamingMessages,
    isStreaming,
    error,
    sendMessage,
    stopAgent,
  };
}
