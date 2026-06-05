import { getThread, addMessage, updateMessage, addUnreadAgent } from "./thread-store";
import { loadAgents, loadDefaultCliModels, loadQuickReplies } from "./agent-store";
import { loadWorkspaces } from "./workspace-store";
import { buildContextualPrompt, buildFullHistoryPrompt } from "./context";
import { QUICK_REPLY_INSTRUCTION, parseQuickReplies } from "./quick-replies";
import { stripMentions } from "./mentions";
import { resolveCliModel, writeMcpConfigFile } from "./config";
import { loadMcpServers } from "./mcp-store";
import { resolvePermissionLevel } from "./permissions";
import { captureSnapshot } from "./snapshots";
import { createStreamParser, StreamEvent } from "./stream-parser";
import { getProcessManager } from "./process-manager";
import { isAgentModel, ToolCall, ContentBlock, PermissionDenial } from "./types";

/**
 * Run a ScheduleWakeup continuation headlessly — i.e. with no connected browser
 * tab driving the SSE stream. This mirrors the persistence pipeline in
 * `app/api/threads/[threadId]/stream/route.ts`, minus the SSE/MCP-app wiring
 * (purely client-display concerns), so the auto-continuation fires and is saved
 * even when the user has closed the tab. Invoked by ProcessManager's server-side
 * wakeup timer; a connected client claims the wakeup first and runs it live.
 */
export async function runWakeupTurn(
  workspaceDir: string,
  threadId: string,
  agentId: string,
  prompt: string
): Promise<void> {
  const thread = await getThread(workspaceDir, threadId);
  if (!thread) return;

  const [allAgents, defaultCliModels, quickRepliesConfig, mcpServers, workspaces] = await Promise.all([
    loadAgents(),
    loadDefaultCliModels(),
    loadQuickReplies(),
    loadMcpServers(),
    loadWorkspaces(),
  ]);

  const agent = allAgents.find((a) => a.id === agentId) ?? thread.agents.find((a) => a.id === agentId);
  if (!agent || !isAgentModel(agent.model)) return;
  const agentModel = agent.model;

  const workspace = workspaces.find((w) => w.directory === workspaceDir) ?? { permissionLevel: undefined };
  const permissionLevel = resolvePermissionLevel(thread, workspace);
  const mcpConfigPath = writeMcpConfigFile(mcpServers);

  const pm = getProcessManager();

  // Assistant placeholder (the continuation has no preceding user message).
  const assistantMsg = await addMessage(workspaceDir, threadId, {
    role: "assistant",
    agentId: agent.id,
    content: "",
    timestamp: new Date().toISOString(),
    status: "streaming",
  });

  const snapshotHash = await captureSnapshot(workspaceDir);
  if (snapshotHash) {
    await updateMessage(workspaceDir, threadId, assistantMsg.id, { snapshotTreeHash: snapshotHash });
  }

  const hasHistory = thread.messages.some(
    (m) => m.role === "assistant" && m.agentId === agent.id && m.status === "complete"
  );
  const quickRepliesSuffix = quickRepliesConfig.enabled ? QUICK_REPLY_INSTRUCTION : "";
  const effectivePersonality = (agent.personality ?? "") + quickRepliesSuffix;
  const effectiveCliModel = resolveCliModel(agentModel, agent.cliModel, defaultCliModels);

  const cleanPrompt = stripMentions(prompt, thread.agents);
  const enrichedPrompt = buildContextualPrompt(thread.messages, agent.id, thread.agents, cleanPrompt);
  const fullHistoryPrompt = hasHistory
    ? buildFullHistoryPrompt(thread.messages, agent.id, thread.agents, cleanPrompt)
    : undefined;

  let accumulatedContent = "";
  const accumulatedToolCalls: ToolCall[] = [];
  const accumulatedBlocks: ContentBlock[] = [];
  const accumulatedDenials: PermissionDenial[] = [];
  let pendingWakeup: { delaySeconds: number; prompt: string } | null = null;
  let lastPersist = Date.now();
  const parser = createStreamParser(agentModel);

  const syncProc = () => {
    const proc = pm.getProcess(threadId, agent.id);
    if (proc) {
      proc.accumulatedContent = accumulatedContent;
      proc.accumulatedBlocks = accumulatedBlocks;
    }
  };

  const processEvents = (events: StreamEvent[]) => {
    for (const event of events) {
      if (event.type === "content") {
        accumulatedContent += event.text;
        const last = accumulatedBlocks[accumulatedBlocks.length - 1];
        if (last && last.type === "text") last.text += event.text;
        else accumulatedBlocks.push({ type: "text", text: event.text });
      } else if (event.type === "tool_start") {
        const tc: ToolCall = { id: event.toolId, name: event.toolName, status: "running", input: event.input };
        accumulatedToolCalls.push(tc);
        accumulatedBlocks.push({ type: "tool_call", toolCall: tc });
      } else if (event.type === "tool_result") {
        const tc = accumulatedToolCalls.find((t) => t.id === event.toolId);
        if (tc) { tc.status = "complete"; tc.output = event.output; }
        const blk = accumulatedBlocks.find((b) => b.type === "tool_call" && b.toolCall.id === event.toolId);
        if (blk && blk.type === "tool_call") { blk.toolCall.status = "complete"; blk.toolCall.output = event.output; }
      } else if (event.type === "schedule_wakeup") {
        accumulatedBlocks.push({
          type: "schedule_wakeup",
          delaySeconds: event.delaySeconds,
          prompt: event.prompt,
          ...(event.reason ? { reason: event.reason } : {}),
        });
        pendingWakeup = { delaySeconds: event.delaySeconds, prompt: event.prompt };
      } else if (event.type === "permission_denials") {
        accumulatedDenials.push(...event.denials);
      } else if (event.type === "error") {
        const errorText = `[Error: ${event.message}]`;
        accumulatedContent += accumulatedContent ? `\n\n${errorText}` : errorText;
      }
    }
    syncProc();

    if (Date.now() - lastPersist > 5000) {
      lastPersist = Date.now();
      updateMessage(workspaceDir, threadId, assistantMsg.id, {
        content: accumulatedContent,
        ...(accumulatedToolCalls.length > 0 ? { toolCalls: accumulatedToolCalls } : {}),
        ...(accumulatedBlocks.length > 0 ? { contentBlocks: accumulatedBlocks } : {}),
      }).catch(() => {});
    }
  };

  await new Promise<void>((resolve) => {
    const finalize = (status: "complete" | "error") => {
      for (const tc of accumulatedToolCalls) {
        if (tc.status === "running") tc.status = status === "error" ? "error" : "complete";
      }

      let finalContent = accumulatedContent;
      let inlineSuggestions: string[] = [];
      if (status === "complete") {
        const parsed = parseQuickReplies(accumulatedContent);
        finalContent = parsed.cleaned;
        inlineSuggestions = parsed.suggestions;
        const last = accumulatedBlocks[accumulatedBlocks.length - 1];
        if (parsed.cleaned !== accumulatedContent && last && last.type === "text") {
          last.text = parseQuickReplies(last.text).cleaned;
        }
      }

      updateMessage(workspaceDir, threadId, assistantMsg.id, {
        content: finalContent || (status === "error" ? "[Wakeup turn failed]" : ""),
        status,
        ...(accumulatedToolCalls.length > 0 ? { toolCalls: accumulatedToolCalls } : {}),
        ...(accumulatedBlocks.length > 0 ? { contentBlocks: accumulatedBlocks } : {}),
        ...(inlineSuggestions.length > 0 ? { suggestions: inlineSuggestions } : {}),
        ...(accumulatedDenials.length > 0 ? { permissionDenials: accumulatedDenials } : {}),
      }).catch(() => {});

      if (status === "complete") {
        // No tab was driving this turn, so flag the thread unread.
        addUnreadAgent(workspaceDir, threadId, agentId).catch(() => {});
        // Chain the next continuation if the model scheduled another wakeup.
        if (pendingWakeup) {
          pm.scheduleWakeup(workspaceDir, threadId, agentId, pendingWakeup.delaySeconds * 1000, pendingWakeup.prompt);
        }
      }
      resolve();
    };

    const handleError = (err: Error) => {
      accumulatedContent += accumulatedContent ? `\n\n[Error: ${err.message}]` : `[Error: ${err.message}]`;
      finalize("error");
    };

    if (agentModel === "claude") {
      pm.startClaudeTurn(
        threadId,
        agent.id,
        effectiveCliModel,
        enrichedPrompt,
        workspaceDir,
        (chunk) => processEvents(parser(chunk)),
        (s) => finalize(s === "complete" ? "complete" : "error"),
        handleError,
        hasHistory,
        effectivePersonality,
        undefined,
        fullHistoryPrompt,
        permissionLevel,
        undefined,
        mcpConfigPath
      );
    } else {
      pm.startCodexTurn(
        threadId,
        agent.id,
        effectiveCliModel,
        enrichedPrompt,
        workspaceDir,
        processEvents,
        (s) => finalize(s === "complete" ? "complete" : "error"),
        handleError,
        hasHistory,
        effectivePersonality,
        undefined,
        fullHistoryPrompt,
        permissionLevel,
        undefined,
        mcpServers
      );
    }
  });
}
