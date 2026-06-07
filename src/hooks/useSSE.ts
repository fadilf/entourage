"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Agent, MessageImage, ToolCall, ContentBlock, PermissionDenial, PendingWakeup } from "@/lib/types";

type StreamingMessage = {
  agentId: string;
  content: string;
  toolCalls?: ToolCall[];
  contentBlocks?: ContentBlock[];
  permissionDenials?: PermissionDenial[];
  isReattach?: boolean;
};

type PendingWakeupInternal = PendingWakeup & { timer?: ReturnType<typeof setTimeout> };

// Safety cap: stop auto-firing ScheduleWakeup continuations after this many
// consecutive chained wakeups (without an intervening manual message) so a model
// can't self-loop forever. The user can still continue manually past the cap.
const MAX_CHAINED_WAKEUPS = 20;

export function useAgentStream(
  threadId: string | null,
  onStreamComplete?: (threadId: string) => void,
  workspaceId?: string | null
) {
  // Store streams for ALL threads in a ref so they persist across threadId changes
  const allStreams = useRef<Map<string, Map<string, StreamingMessage>>>(
    new Map()
  );
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  // Serializes streams per (threadId, agentId): a follow-up message sent while
  // an agent is still streaming is chained to run after the current turn, so the
  // two turns never share the single per-agent streaming display slot. This
  // mirrors how the CLI queues messages typed while it's working.
  const agentChains = useRef<Map<string, Promise<void>>>(new Map());
  const autoDispatchCounters = useRef<Map<string, number>>(new Map());
  // Pending ScheduleWakeup continuations, keyed by threadId then agentId, plus a
  // per-(thread,agent) counter of consecutive auto-fires for the safety cap.
  const allWakeups = useRef<Map<string, Map<string, PendingWakeupInternal>>>(new Map());
  const wakeupCounters = useRef<Map<string, number>>(new Map());
  const [autoDispatchPaused, setAutoDispatchPaused] = useState(false);
  const [, setRenderTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onCompleteRef = useRef(onStreamComplete);
  onCompleteRef.current = onStreamComplete;
  // Ref to streamAgent so auto_dispatch can call it without circular deps
  const streamAgentRef = useRef<((tid: string, agentId: string, prompt: string) => Promise<void>) | undefined>(undefined);
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  const triggerRender = useCallback(() => setRenderTick((t) => t + 1), []);

  // --- ScheduleWakeup auto-continuation ---

  /**
   * Coordinate a wakeup with the server's authoritative timer.
   * - "claim": take over a pending wakeup to run it live. Resolves true if we
   *   should proceed locally; false means the server already fired it headlessly.
   * - "cancel": drop the server timer (user dismissed / took over / stopped).
   * Best-effort: on a network error we proceed locally rather than stall.
   */
  const postWakeup = useCallback(
    (tid: string, agentId: string, action: "claim" | "cancel"): Promise<boolean> => {
      const q = workspaceIdRef.current ? `?workspaceId=${workspaceIdRef.current}` : "";
      return fetch(`/api/threads/${tid}/wakeup${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, action }),
      })
        .then((r) => r.json())
        .then((d) => (action === "claim" ? d?.claimed !== false : true))
        .catch(() => true);
    },
    []
  );

  /** Clear a pending wakeup's timer and drop it from the map (no re-render). */
  const clearWakeupTimer = useCallback((tid: string, agentId: string) => {
    const m = allWakeups.current.get(tid);
    const w = m?.get(agentId);
    if (w?.timer) clearTimeout(w.timer);
    if (m) {
      m.delete(agentId);
      if (m.size === 0) allWakeups.current.delete(tid);
    }
  }, []);

  /** Fire a due wakeup: claim it from the server, then re-submit live. */
  const fireWakeup = useCallback(
    (tid: string, agentId: string) => {
      const w = allWakeups.current.get(tid)?.get(agentId);
      if (!w) return;
      const { prompt } = w;
      clearWakeupTimer(tid, agentId);
      const ck = `${tid}:${agentId}`;
      wakeupCounters.current.set(ck, (wakeupCounters.current.get(ck) ?? 0) + 1);
      triggerRender();
      // Claim from the server so its fallback timer doesn't also fire. If the
      // server already fired headlessly (claimed === false), don't double-run —
      // the new streaming message will be picked up on reattach.
      void postWakeup(tid, agentId, "claim").then((proceed) => {
        if (proceed) streamAgentRef.current?.(tid, agentId, prompt);
      });
    },
    [clearWakeupTimer, triggerRender, postWakeup]
  );

  /** Register a wakeup requested by the model's ScheduleWakeup tool. */
  const scheduleWakeup = useCallback(
    (tid: string, agentId: string, delaySeconds: number, prompt: string, reason?: string) => {
      clearWakeupTimer(tid, agentId); // replace any prior pending wakeup
      if (!allWakeups.current.has(tid)) allWakeups.current.set(tid, new Map());
      const slot = allWakeups.current.get(tid)!;
      const ck = `${tid}:${agentId}`;
      const count = wakeupCounters.current.get(ck) ?? 0;
      if (count >= MAX_CHAINED_WAKEUPS) {
        // Cap hit — keep it visible but require a manual "continue".
        slot.set(agentId, { agentId, prompt, reason, fireAt: null, capped: true });
        triggerRender();
        return;
      }
      const delayMs = Math.max(1, Math.min(3600, delaySeconds || 60)) * 1000;
      const timer = setTimeout(() => fireWakeup(tid, agentId), delayMs);
      slot.set(agentId, { agentId, prompt, reason, fireAt: Date.now() + delayMs, timer });
      triggerRender();
    },
    [clearWakeupTimer, fireWakeup, triggerRender]
  );

  /** Cancel a scheduled wakeup (user dismissed it), server-side included. */
  const cancelWakeup = useCallback(
    (agentId: string) => {
      const tid = threadIdRef.current;
      if (!tid) return;
      clearWakeupTimer(tid, agentId);
      void postWakeup(tid, agentId, "cancel");
      triggerRender();
    },
    [clearWakeupTimer, triggerRender, postWakeup]
  );

  /** Continue now: fire a wakeup immediately, resetting the chained-wakeup cap. */
  const continueWakeupNow = useCallback(
    (agentId: string) => {
      const tid = threadIdRef.current;
      if (!tid) return;
      const w = allWakeups.current.get(tid)?.get(agentId);
      if (!w) return;
      wakeupCounters.current.set(`${tid}:${agentId}`, 0);
      const { prompt } = w;
      clearWakeupTimer(tid, agentId);
      triggerRender();
      // Cancel the server's pending fallback and reset its chain budget (this is a
      // deliberate manual continue), then run the turn live. Its completion arms a
      // fresh server timer from zero, so tab-closed firing resumes afterwards.
      void postWakeup(tid, agentId, "cancel").then(() => {
        streamAgentRef.current?.(tid, agentId, prompt);
      });
    },
    [clearWakeupTimer, triggerRender, postWakeup]
  );

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

  // Expose the current thread's pending ScheduleWakeup continuations.
  const emptyWakeups = useRef(new Map<string, PendingWakeup>()).current;
  const pendingWakeups: Map<string, PendingWakeup> = threadId
    ? allWakeups.current.get(threadId) ?? emptyWakeups
    : emptyWakeups;

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
        case "schedule_wakeup": {
          // Show the wakeup inline in the current turn, and arm the timer that
          // re-prompts the agent once it elapses (survives stream cleanup).
          const blocks = [...(existing?.contentBlocks ?? [])];
          blocks.push({ type: "schedule_wakeup", delaySeconds: event.delaySeconds, prompt: event.prompt, ...(event.reason ? { reason: event.reason } : {}) });
          threadStreams.set(agentId, { ...existing, agentId, content: existing?.content ?? "", contentBlocks: blocks });
          scheduleWakeup(tid, agentId, event.delaySeconds, event.prompt, event.reason);
          triggerRender();
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
    [triggerRender, scheduleWakeup]
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
    const wakeups = allWakeups.current;
    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
      for (const slot of wakeups.values()) {
        for (const w of slot.values()) {
          if (w.timer) clearTimeout(w.timer);
        }
      }
    };
  }, []);

  // --- Public API ---

  const runStream = useCallback(
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
      // Yield to let React render the empty streaming state ("Thinking..." indicator)
      // before the fetch begins and content events start arriving.
      await new Promise((r) => setTimeout(r, 0));

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

  // Public entry point: serialize per-agent so a message sent while the agent is
  // still streaming runs after the current turn completes (matching the CLI's
  // queue behavior) instead of clobbering the single per-agent display slot.
  const streamAgent = useCallback(
    (
      targetThreadId: string,
      agentId: string,
      prompt: string,
      images?: MessageImage[],
      attachedThreadIds?: string[]
    ): Promise<void> => {
      const key = `${targetThreadId}:${agentId}`;
      const prev = agentChains.current.get(key) ?? Promise.resolve();
      const run = prev
        .catch(() => {})
        .then(() => runStream(targetThreadId, agentId, prompt, images, attachedThreadIds));
      agentChains.current.set(key, run.catch(() => {}));
      return run;
    },
    [runStream]
  );

  streamAgentRef.current = streamAgent;

  const sendMessage = useCallback(
    async (content: string, targetAgents: Agent[], images?: MessageImage[], attachedThreadIds?: string[]) => {
      if (!threadId) return;
      const currentThreadId = threadId;
      setError(null);

      // A manual message means the user took over: cancel any pending auto-wakeup
      // for these agents (server-side too) and reset their chained-wakeup budget.
      for (const agent of targetAgents) {
        clearWakeupTimer(currentThreadId, agent.id);
        wakeupCounters.current.set(`${currentThreadId}:${agent.id}`, 0);
        void postWakeup(currentThreadId, agent.id, "cancel");
      }

      await Promise.all(
        targetAgents.map((agent) =>
          streamAgent(currentThreadId, agent.id, content, images, attachedThreadIds)
        )
      );
    },
    [threadId, streamAgent, clearWakeupTimer, postWakeup]
  );

  const stopAgent = useCallback(
    async (agentId: string) => {
      if (!threadId) return;
      // Stopping an agent also cancels any wakeup it had armed (server-side too).
      clearWakeupTimer(threadId, agentId);
      void postWakeup(threadId, agentId, "cancel");
      triggerRender();
      const controllerKey = `${threadId}:${agentId}`;
      abortControllers.current.get(controllerKey)?.abort();
      await fetch(`/api/threads/${threadId}/stop${wsParam()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
    },
    [threadId, wsParam, clearWakeupTimer, triggerRender, postWakeup]
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
    pendingWakeups,
    cancelWakeup,
    continueWakeupNow,
  };
}
