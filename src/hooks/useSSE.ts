"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Agent, MessageImage, ToolCall, ContentBlock, PermissionDenial } from "@/lib/types";

type StreamingMessage = {
  agentId: string;
  content: string;
  toolCalls?: ToolCall[];
  contentBlocks?: ContentBlock[];
  permissionDenials?: PermissionDenial[];
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
  const autoDispatchCounters = useRef<Map<string, number>>(new Map());
  const [autoDispatchPaused, setAutoDispatchPaused] = useState(false);
  const [, setRenderTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onCompleteRef = useRef(onStreamComplete);
  onCompleteRef.current = onStreamComplete;
  const onSuggestionsRef = useRef(onInlineSuggestions);
  onSuggestionsRef.current = onInlineSuggestions;
  // Ref to streamAgent so auto_dispatch can call it without circular deps
  const streamAgentRef = useRef<((tid: string, agentId: string, prompt: string) => Promise<void>) | undefined>(undefined);
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
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

  // --- Shared SSE event processing ---

  /** Apply a single parsed SSE event to the streaming state. Returns "done" status or null. */
  const handleEvent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tid: string, agentId: string, event: any): string | null => {
      const threadStreams = allStreams.current.get(tid);
      if (!threadStreams) return null;
      const existing = threadStreams.get(agentId);

      switch (event.type) {
        case "initial": {
          // Reattach-only: restore full accumulated state (content + blocks).
          // If the server sent blocks (with tool calls, mcp apps, etc.), use those;
          // otherwise fall back to a single text block from the content string.
          const initialBlocks: ContentBlock[] = Array.isArray(event.blocks) && event.blocks.length > 0
            ? event.blocks
            : event.content ? [{ type: "text" as const, text: event.content }] : [];
          // Extract tool calls from blocks for the toolCalls field
          const initialToolCalls: ToolCall[] = initialBlocks
            .filter((b): b is ContentBlock & { type: "tool_call" } => b.type === "tool_call")
            .map((b) => b.toolCall);
          threadStreams.set(agentId, {
            agentId,
            content: event.content,
            contentBlocks: initialBlocks,
            ...(initialToolCalls.length > 0 ? { toolCalls: initialToolCalls } : {}),
            isReattach: false,
          });
          triggerRender();
          break;
        }
        case "content": {
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
          break;
        }
        case "tool_start": {
          const toolCalls = [...(existing?.toolCalls ?? [])];
          const tc: ToolCall = { id: event.toolId, name: event.toolName, status: "running", input: event.input };
          toolCalls.push(tc);
          const blocks = [...(existing?.contentBlocks ?? [])];
          blocks.push({ type: "tool_call", toolCall: tc });
          threadStreams.set(agentId, { ...existing, agentId, content: existing?.content ?? "", toolCalls, contentBlocks: blocks });
          triggerRender();
          break;
        }
        case "tool_result": {
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
          break;
        }
        case "mcp_app": {
          const blocks = [...(existing?.contentBlocks ?? [])];
          blocks.push({
            type: "mcp_app",
            toolName: event.toolName,
            serverId: event.serverId,
            toolInput: event.toolInput,
            html: event.html,
          });
          threadStreams.set(agentId, { ...existing, agentId, content: existing?.content ?? "", contentBlocks: blocks });
          triggerRender();
          break;
        }
        case "mcp_app_result": {
          const blocks = [...(existing?.contentBlocks ?? [])];
          const appIdx = blocks.findLastIndex((b) => b.type === "mcp_app" && (b as { toolName: string }).toolName === event.toolName);
          if (appIdx >= 0) {
            const block = blocks[appIdx] as { type: "mcp_app"; toolName: string; serverId: string; toolInput?: Record<string, unknown>; toolResult?: Record<string, unknown>; html?: string };
            blocks[appIdx] = { ...block, toolResult: event.toolResult };
          }
          threadStreams.set(agentId, { ...existing, agentId, content: existing?.content ?? "", contentBlocks: blocks });
          triggerRender();
          break;
        }
        case "permission_denials": {
          const denials = [...(existing?.permissionDenials ?? []), ...event.denials];
          threadStreams.set(agentId, { ...existing, agentId, content: existing?.content ?? "", permissionDenials: denials });
          triggerRender();
          break;
        }
        case "suggestions": {
          if (tid === threadIdRef.current) {
            onSuggestionsRef.current?.(event.suggestions);
          }
          break;
        }
        case "auto_dispatch": {
          const counter = (autoDispatchCounters.current.get(tid) ?? 0) + 1;
          autoDispatchCounters.current.set(tid, counter);
          const limit = event.limit ?? 50;
          if (counter > limit) {
            setAutoDispatchPaused(true);
          } else {
            const prompt = `(auto-dispatched by @${event.sourceAgentName})`;
            for (const a of event.agents) {
              streamAgentRef.current?.(tid, a.id, prompt);
            }
          }
          break;
        }
        case "done":
          return event.status ?? "complete";
        case "error":
          setError(event.message);
          break;
      }
      return null;
    },
    [triggerRender]
  );

  /** Read an SSE response body, dispatching parsed events to handleEvent. Returns done status. */
  const consumeStream = useCallback(
    async (body: ReadableStream<Uint8Array>, tid: string, agentId: string): Promise<string | null> => {
      const reader = body.getReader();
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
            const status = handleEvent(tid, agentId, event);
            if (status) return status;
          } catch {
            // Not valid JSON
          }
        }
      }
      return null;
    },
    [handleEvent]
  );

  /** Clean up streaming state after a stream ends (success or failure). */
  const cleanupStream = useCallback(
    (tid: string, agentId: string, success?: boolean) => {
      const controllerKey = `${tid}:${agentId}`;
      abortControllers.current.delete(controllerKey);
      const threadStreams = allStreams.current.get(tid);
      if (threadStreams) {
        threadStreams.delete(agentId);
        if (threadStreams.size === 0) {
          allStreams.current.delete(tid);
          onCompleteRef.current?.(tid);
        }
      }
      // If the stream completed successfully and the user is on a different thread,
      // mark this thread as unread so the sidebar shows the unread style.
      if (success && tid !== threadIdRef.current) {
        fetch(`/api/threads/${tid}/unread${wsParam()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        }).catch(() => {});
      }
      triggerRender();
    },
    [triggerRender, wsParam]
  );

  // Abort all SSE connections when the hook unmounts (e.g. navigating away from a thread).
  // This lets the server detect clientDisconnected and mark the thread as unread.
  useEffect(() => {
    const controllers = abortControllers.current;
    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
    };
  }, []);

  // --- Public API ---

  const streamAgent = useCallback(
    async (
      targetThreadId: string,
      agentId: string,
      prompt: string,
      images?: MessageImage[],
      attachedThreadIds?: string[]
    ) => {
      const controllerKey = `${targetThreadId}:${agentId}`;
      const controller = new AbortController();
      abortControllers.current.set(controllerKey, controller);

      if (!allStreams.current.has(targetThreadId)) {
        allStreams.current.set(targetThreadId, new Map());
      }
      allStreams.current
        .get(targetThreadId)!
        .set(agentId, { agentId, content: "" });
      triggerRender();

      let doneStatus: string | null = null;
      try {
        const res = await fetch(`/api/threads/${targetThreadId}/stream${wsParam()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            prompt,
            ...(images && images.length > 0 ? { images } : {}),
            ...(attachedThreadIds && attachedThreadIds.length > 0 ? { attachedThreadIds } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream failed: ${res.status}`);
        }

        doneStatus = await consumeStream(res.body, targetThreadId, agentId);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        cleanupStream(targetThreadId, agentId, doneStatus === "complete");
      }
    },
    [triggerRender, wsParam, consumeStream, cleanupStream]
  );

  streamAgentRef.current = streamAgent;

  const sendMessage = useCallback(
    async (content: string, targetAgents: Agent[], images?: MessageImage[], attachedThreadIds?: string[]) => {
      if (!threadId) return;
      const currentThreadId = threadId;
      setError(null);

      await Promise.all(
        targetAgents.map((agent) =>
          streamAgent(currentThreadId, agent.id, content, images, attachedThreadIds)
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

      if (!allStreams.current.has(reattachThreadId)) {
        allStreams.current.set(reattachThreadId, new Map());
      }
      allStreams.current
        .get(reattachThreadId)!
        .set(agentId, { agentId, content: "", isReattach: true });
      triggerRender();

      let doneStatus: string | null = null;
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

        doneStatus = await consumeStream(res.body, reattachThreadId, agentId);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Re-attach failed:", err);
        }
      } finally {
        cleanupStream(reattachThreadId, agentId, doneStatus === "complete");
      }
    },
    [triggerRender, wsParam, consumeStream, cleanupStream]
  );

  const resetAutoDispatch = useCallback(() => {
    if (threadId) {
      autoDispatchCounters.current.set(threadId, 0);
    }
    setAutoDispatchPaused(false);
  }, [threadId]);

  return {
    streamingMessages,
    isStreaming,
    error,
    sendMessage,
    stopAgent,
    reattach,
    autoDispatchPaused,
    resetAutoDispatch,
  };
}
