"use client";

import { useState, useCallback, useRef } from "react";
import { Agent, MessageImage, ToolCall, ContentBlock } from "@/lib/types";

type StreamingMessage = {
  agentId: string;
  content: string;
  toolCalls?: ToolCall[];
  contentBlocks?: ContentBlock[];
  isReattach?: boolean;
};

export function useAgentStream(
  threadId: string | null,
  onStreamComplete?: (threadId: string) => void,
  workspaceId?: string | null,
  onInlineSuggestions?: (suggestions: string[]) => void
) {
  // Store streams for ALL threads in a ref so they persist across threadId changes
  const allStreams = useRef<Map<string, Map<string, StreamingMessage>>>(
    new Map()
  );
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const [, setRenderTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onCompleteRef = useRef(onStreamComplete);
  onCompleteRef.current = onStreamComplete;
  const onSuggestionsRef = useRef(onInlineSuggestions);
  onSuggestionsRef.current = onInlineSuggestions;
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  const triggerRender = useCallback(() => setRenderTick((t) => t + 1), []);

  const wsParam = useCallback(() => {
    const id = workspaceIdRef.current;
    return id ? `?workspaceId=${id}` : "";
  }, []);

  // Expose only the current thread's streaming messages (stable empty ref to avoid re-renders)
  const emptyMap = useRef(new Map<string, StreamingMessage>()).current;
  const streamingMessages = threadId
    ? allStreams.current.get(threadId) ?? emptyMap
    : emptyMap;
  const isStreaming = streamingMessages.size > 0;

  const streamAgent = useCallback(
    async (
      targetThreadId: string,
      agentId: string,
      prompt: string,
      images?: MessageImage[]
    ) => {
      const controllerKey = `${targetThreadId}:${agentId}`;
      const controller = new AbortController();
      abortControllers.current.set(controllerKey, controller);

      // Initialize streaming entry for this thread
      if (!allStreams.current.has(targetThreadId)) {
        allStreams.current.set(targetThreadId, new Map());
      }
      allStreams.current
        .get(targetThreadId)!
        .set(agentId, { agentId, content: "" });
      triggerRender();

      try {
        const res = await fetch(`/api/threads/${targetThreadId}/stream${wsParam()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            prompt,
            ...(images && images.length > 0 ? { images } : {}),
          }),
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
                const threadStreams = allStreams.current.get(targetThreadId);
                if (threadStreams) {
                  const existing = threadStreams.get(agentId);
                  const blocks = [...(existing?.contentBlocks ?? [])];
                  const lastBlock = blocks[blocks.length - 1];
                  if (lastBlock && lastBlock.type === "text") {
                    blocks[blocks.length - 1] = { type: "text", text: lastBlock.text + event.text };
                  } else {
                    blocks.push({ type: "text", text: event.text });
                  }
                  threadStreams.set(agentId, {
                    ...existing,
                    agentId,
                    content: (existing?.content ?? "") + event.text,
                    contentBlocks: blocks,
                  });
                  triggerRender();
                }
              } else if (event.type === "tool_start") {
                const threadStreams = allStreams.current.get(targetThreadId);
                if (threadStreams) {
                  const existing = threadStreams.get(agentId);
                  const toolCalls = [...(existing?.toolCalls ?? [])];
                  const tc: ToolCall = { id: event.toolId, name: event.toolName, status: "running", input: event.input };
                  toolCalls.push(tc);
                  const blocks = [...(existing?.contentBlocks ?? [])];
                  blocks.push({ type: "tool_call", toolCall: tc });
                  threadStreams.set(agentId, { ...existing, agentId, content: existing?.content ?? "", toolCalls, contentBlocks: blocks });
                  triggerRender();
                }
              } else if (event.type === "tool_result") {
                const threadStreams = allStreams.current.get(targetThreadId);
                if (threadStreams) {
                  const existing = threadStreams.get(agentId);
                  const toolCalls = [...(existing?.toolCalls ?? [])];
                  const tc = toolCalls.find((t) => t.id === event.toolId);
                  if (tc) {
                    tc.status = "complete";
                    tc.output = event.output;
                  }
                  // Also update the matching block
                  const blocks = [...(existing?.contentBlocks ?? [])];
                  const blockIdx = blocks.findIndex((b) => b.type === "tool_call" && b.toolCall.id === event.toolId);
                  if (blockIdx >= 0) {
                    const block = blocks[blockIdx] as { type: "tool_call"; toolCall: ToolCall };
                    blocks[blockIdx] = { type: "tool_call", toolCall: { ...block.toolCall, status: "complete", output: event.output } };
                  }
                  threadStreams.set(agentId, { ...existing, agentId, content: existing?.content ?? "", toolCalls, contentBlocks: blocks });
                  triggerRender();
                }
              } else if (event.type === "suggestions") {
                onSuggestionsRef.current?.(event.suggestions);
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
        abortControllers.current.delete(controllerKey);
        const threadStreams = allStreams.current.get(targetThreadId);
        if (threadStreams) {
          threadStreams.delete(agentId);
          if (threadStreams.size === 0) {
            allStreams.current.delete(targetThreadId);
            // All agents for this thread are done
            onCompleteRef.current?.(targetThreadId);
          }
        }
        triggerRender();
      }
    },
    [triggerRender, wsParam]
  );

  const sendMessage = useCallback(
    async (content: string, targetAgents: Agent[], images?: MessageImage[]) => {
      if (!threadId) return;
      const currentThreadId = threadId;
      setError(null);

      await Promise.all(
        targetAgents.map((agent) =>
          streamAgent(currentThreadId, agent.id, content, images)
        )
      );
    },
    [threadId, streamAgent]
  );

  const stopAgent = useCallback(
    async (agentId: string) => {
      if (!threadId) return;
      const controllerKey = `${threadId}:${agentId}`;
      abortControllers.current.get(controllerKey)?.abort();
      await fetch(`/api/threads/${threadId}/stop${wsParam()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
    },
    [threadId, wsParam]
  );

  const reattach = useCallback(
    async (reattachThreadId: string, agentId: string) => {
      const controllerKey = `${reattachThreadId}:${agentId}`;

      // Don't re-attach if already streaming this agent
      if (abortControllers.current.has(controllerKey)) return;

      const controller = new AbortController();
      abortControllers.current.set(controllerKey, controller);

      // Initialize streaming entry
      if (!allStreams.current.has(reattachThreadId)) {
        allStreams.current.set(reattachThreadId, new Map());
      }
      allStreams.current
        .get(reattachThreadId)!
        .set(agentId, { agentId, content: "", isReattach: true });
      triggerRender();

      try {
        const res = await fetch(
          `/api/threads/${reattachThreadId}/stream${wsParam()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId, prompt: "" }),
            signal: controller.signal,
          }
        );

        if (!res.ok || !res.body) {
          throw new Error(`Re-attach failed: ${res.status}`);
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
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "initial") {
                // Set (not append) persisted content
                const threadStreams = allStreams.current.get(reattachThreadId);
                if (threadStreams) {
                  threadStreams.set(agentId, { agentId, content: event.content, isReattach: false });
                  triggerRender();
                }
              } else if (event.type === "content") {
                const threadStreams = allStreams.current.get(reattachThreadId);
                if (threadStreams) {
                  const existing = threadStreams.get(agentId);
                  const blocks = [...(existing?.contentBlocks ?? [])];
                  const lastBlock = blocks[blocks.length - 1];
                  if (lastBlock && lastBlock.type === "text") {
                    blocks[blocks.length - 1] = { type: "text", text: lastBlock.text + event.text };
                  } else {
                    blocks.push({ type: "text", text: event.text });
                  }
                  threadStreams.set(agentId, {
                    ...existing,
                    agentId,
                    content: (existing?.content ?? "") + event.text,
                    contentBlocks: blocks,
                  });
                  triggerRender();
                }
              } else if (event.type === "tool_start") {
                const threadStreams = allStreams.current.get(reattachThreadId);
                if (threadStreams) {
                  const existing = threadStreams.get(agentId);
                  const toolCalls = [...(existing?.toolCalls ?? [])];
                  const tc: ToolCall = { id: event.toolId, name: event.toolName, status: "running", input: event.input };
                  toolCalls.push(tc);
                  const blocks = [...(existing?.contentBlocks ?? [])];
                  blocks.push({ type: "tool_call", toolCall: tc });
                  threadStreams.set(agentId, { ...existing, agentId, content: existing?.content ?? "", toolCalls, contentBlocks: blocks });
                  triggerRender();
                }
              } else if (event.type === "tool_result") {
                const threadStreams = allStreams.current.get(reattachThreadId);
                if (threadStreams) {
                  const existing = threadStreams.get(agentId);
                  const toolCalls = [...(existing?.toolCalls ?? [])];
                  const tc = toolCalls.find((t) => t.id === event.toolId);
                  if (tc) {
                    tc.status = "complete";
                    tc.output = event.output;
                  }
                  const blocks = [...(existing?.contentBlocks ?? [])];
                  const blockIdx = blocks.findIndex((b) => b.type === "tool_call" && b.toolCall.id === event.toolId);
                  if (blockIdx >= 0) {
                    const block = blocks[blockIdx] as { type: "tool_call"; toolCall: ToolCall };
                    blocks[blockIdx] = { type: "tool_call", toolCall: { ...block.toolCall, status: "complete", output: event.output } };
                  }
                  threadStreams.set(agentId, { ...existing, agentId, content: existing?.content ?? "", toolCalls, contentBlocks: blocks });
                  triggerRender();
                }
              } else if (event.type === "suggestions") {
                onSuggestionsRef.current?.(event.suggestions);
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
          console.error("Re-attach failed:", err);
        }
      } finally {
        abortControllers.current.delete(controllerKey);
        const threadStreams = allStreams.current.get(reattachThreadId);
        if (threadStreams) {
          threadStreams.delete(agentId);
          if (threadStreams.size === 0) {
            allStreams.current.delete(reattachThreadId);
            onCompleteRef.current?.(reattachThreadId);
          }
        }
        triggerRender();
      }
    },
    [triggerRender, wsParam]
  );

  return {
    streamingMessages,
    isStreaming,
    error,
    sendMessage,
    stopAgent,
    reattach,
  };
}
