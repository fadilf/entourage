import { NextResponse } from "next/server";
import { getThread, addMessage, updateMessage, addUnreadAgent } from "@/lib/thread-store";
import { getProcessManager } from "@/lib/process-manager";
import { createStreamParser } from "@/lib/stream-parser";
import { MessageImage, ToolCall, ContentBlock, PermissionDenial, isAgentModel } from "@/lib/types";
import { loadAgents, loadDefaultCliModels, loadQuickReplies } from "@/lib/agent-store";
import { buildContextualPrompt, buildFullHistoryPrompt } from "@/lib/context";
import { QUICK_REPLY_INSTRUCTION, parseQuickReplies } from "@/lib/quick-replies";
import { stripMentions, parseMentions } from "@/lib/mentions";
import path from "path";
import { getUploadsDir, ENTOURAGE_DIR, THREADS_DIR, resolveCliModel, writeMcpConfigFile } from "@/lib/config";
import { loadMcpServers } from "@/lib/mcp-store";
import { resolveWorkspace } from "@/lib/workspace-context";
import { resolvePermissionLevel } from "@/lib/permissions";
import { captureSnapshot } from "@/lib/snapshots";
import { getMcpClientManager } from "@/lib/mcp-client-manager";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const workspace = await resolveWorkspace(request);
  const workspaceDir = workspace.directory;
  const { threadId } = await params;
  const thread = await getThread(workspaceDir, threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { agentId, prompt, images, attachedThreadIds } = (await request.json()) as { agentId: string; prompt: string; images?: MessageImage[]; attachedThreadIds?: string[] };

  // Resolve image paths
  const imagePaths = images?.map((img) => path.join(getUploadsDir(workspaceDir), img.filename)) ?? [];
  const threadPaths = attachedThreadIds?.map((id) => path.join(workspaceDir, ENTOURAGE_DIR, THREADS_DIR, `${id}.json`)) ?? [];

  // Resolve fresh agent data from store (picks up personality edits)
  const [allAgents, defaultCliModels, quickRepliesConfig, mcpServers] = await Promise.all([
    loadAgents(),
    loadDefaultCliModels(),
    loadQuickReplies(),
    loadMcpServers(),
  ]);
  const mcpConfigPath = writeMcpConfigFile(mcpServers);
  const freshAgent = allAgents.find((a) => a.id === agentId);
  // Fall back to thread-stored agent data if agent was deleted
  const agent = freshAgent ?? thread.agents.find((a) => a.id === agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not in thread" }, { status: 400 });
  }
  if (!isAgentModel(agent.model)) {
    return NextResponse.json({ error: "Unsupported agent model" }, { status: 400 });
  }
  const agentModel = agent.model;

  const pm = getProcessManager();

  // Check if already running — re-attach
  const existing = pm.getProcess(threadId, agentId);
  if (existing) {
    // Return existing buffer as SSE stream then continue piping
    const reattachParser = createStreamParser(agentModel);
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let clientDisconnected = false;
        request.signal.addEventListener("abort", () => {
          clientDisconnected = true;
        });

        // Send in-memory accumulated state (avoids gap from periodic persist)
        if (existing.accumulatedContent || existing.accumulatedBlocks.length > 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: "initial",
              content: existing.accumulatedContent,
              ...(existing.accumulatedBlocks.length > 0 ? { blocks: existing.accumulatedBlocks } : {}),
            })}\n\n`)
          );
        }

        // Pipe future output through parser
        existing.process.stdout?.on("data", (data: Buffer) => {
          try {
            const events = reattachParser(data.toString());
            for (const event of events) {
              if (event.type === "content" || event.type.startsWith("tool_")) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              }
            }
          } catch {
            // Controller closed
          }
        });

        existing.process.on("close", (code) => {
          const status = code === 0 ? "complete" : "error";
          if (clientDisconnected && status === "complete") {
            addUnreadAgent(workspaceDir, threadId, agentId).catch(() => {});
          }
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", status })}\n\n`));
            controller.close();
          } catch {
            // Already closed
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Encoding": "none",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Guard: empty prompt with no running process means stale re-attach attempt
  if (!prompt) {
    return NextResponse.json(
      { error: "Process no longer running" },
      { status: 410 }
    );
  }

  // Create assistant message placeholder
  const assistantMsg = await addMessage(workspaceDir, threadId, {
    role: "assistant",
    agentId: agent.id,
    content: "",
    timestamp: new Date().toISOString(),
    status: "streaming",
  });

  // Capture workspace snapshot before agent makes changes (best-effort)
  const snapshotHash = await captureSnapshot(workspaceDir);
  if (snapshotHash) {
    await updateMessage(workspaceDir, threadId, assistantMsg.id, {
      snapshotTreeHash: snapshotHash,
    });
  }

  // Check if this agent already has completed assistant messages (for --resume)
  const hasHistory = thread.messages.some(
    (m) => m.role === "assistant" && m.agentId === agent.id && m.status === "complete"
  );

  const quickRepliesSuffix = quickRepliesConfig.enabled ? QUICK_REPLY_INSTRUCTION : "";
  const effectivePersonality = (agent.personality ?? "") + quickRepliesSuffix;
  const effectiveCliModel = resolveCliModel(agentModel, agent.cliModel, defaultCliModels);

  const cleanPrompt = stripMentions(prompt, thread.agents);
  const enrichedPrompt = buildContextualPrompt(thread.messages, agent.id, thread.agents, cleanPrompt);
  // Build full history prompt for fallback when --resume fails (session lost)
  const fullHistoryPrompt = hasHistory
    ? buildFullHistoryPrompt(thread.messages, agent.id, thread.agents, cleanPrompt)
    : undefined;

  // Ensure MCP servers are connected (lazy init, idempotent)
  const mcpManager = getMcpClientManager();
  await mcpManager.connectAll().catch(() => {});

  const permissionLevel = resolvePermissionLevel(thread, workspace);

  let accumulatedContent = "";
  const accumulatedToolCalls: ToolCall[] = [];
  const accumulatedBlocks: ContentBlock[] = [];
  const accumulatedDenials: PermissionDenial[] = [];
  let lastPersist = Date.now();
  const parser = createStreamParser(agentModel);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let clientDisconnected = false;
      request.signal.addEventListener("abort", () => {
        clientDisconnected = true;
      });
      const cwd = workspaceDir;

      try {
        pm.spawn(
          threadId,
          agent.id,
          agentModel,
          effectiveCliModel,
          enrichedPrompt,
          cwd,
          // onData
          (chunk: string) => {
            const events = parser(chunk);
            for (const event of events) {
              if (event.type === "content") {
                accumulatedContent += event.text;
                // Keep process entry in sync for re-attachment
                const proc = pm.getProcess(threadId, agent.id);
                if (proc) {
                  proc.accumulatedContent = accumulatedContent;
                  proc.accumulatedBlocks = accumulatedBlocks;
                }
                // Append to last text block or create new one
                const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1];
                if (lastBlock && lastBlock.type === "text") {
                  lastBlock.text += event.text;
                } else {
                  accumulatedBlocks.push({ type: "text", text: event.text });
                }
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch {
                  // Client disconnected
                }
              } else if (event.type === "tool_start") {
                const tc: ToolCall = {
                  id: event.toolId,
                  name: event.toolName,
                  status: "running",
                  input: event.input,
                };
                accumulatedToolCalls.push(tc);
                accumulatedBlocks.push({ type: "tool_call", toolCall: tc });
                // Keep process entry blocks in sync for re-attachment
                const proc = pm.getProcess(threadId, agent.id);
                if (proc) proc.accumulatedBlocks = accumulatedBlocks;
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch { /* Client disconnected */ }

                // Check if this tool has an MCP App UI
                const mcpAppTool = mcpManager.getAppTool(event.toolName);
                if (mcpAppTool) {
                  let parsedInput: Record<string, unknown> | undefined;
                  if (event.input) {
                    try { parsedInput = JSON.parse(event.input); } catch { /* skip */ }
                  }

                  const appBlock: ContentBlock = {
                    type: "mcp_app",
                    toolName: event.toolName,
                    serverId: mcpAppTool.serverId,
                    toolInput: parsedInput,
                    html: mcpAppTool.cachedHtml,
                  };
                  accumulatedBlocks.push(appBlock);

                  // Emit mcp_app event with cached HTML so client doesn't need to fetch
                  try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      type: "mcp_app",
                      toolName: event.toolName,
                      serverId: mcpAppTool.serverId,
                      toolInput: parsedInput,
                      html: mcpAppTool.cachedHtml,
                    })}\n\n`));
                  } catch { /* Client disconnected */ }
                }
              } else if (event.type === "tool_result") {
                const tc = accumulatedToolCalls.find((t) => t.id === event.toolId);
                if (tc) {
                  tc.status = "complete";
                  tc.output = event.output;
                }
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch { /* Client disconnected */ }

                // Forward result to MCP App block if present
                const matchingTc = accumulatedToolCalls.find((t) => t.id === event.toolId);
                if (matchingTc) {
                  const appBlock = accumulatedBlocks.find(
                    (b) => b.type === "mcp_app" && b.toolName === matchingTc.name
                  );
                  if (appBlock && appBlock.type === "mcp_app") {
                    try {
                      const resultData = JSON.parse(event.output);
                      appBlock.toolResult = resultData;
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: "mcp_app_result",
                        toolName: appBlock.toolName,
                        toolResult: resultData,
                      })}\n\n`));
                    } catch { /* non-JSON output, skip */ }
                  }
                }
              } else if (event.type === "permission_denials") {
                accumulatedDenials.push(...event.denials);
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch { /* Client disconnected */ }
              } else if (event.type === "error") {
                // API-level error from the CLI (e.g. rate limit, auth failure)
                const errorText = `[Error: ${event.message}]`;
                accumulatedContent += accumulatedContent ? `\n\n${errorText}` : errorText;
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch {
                  // Client disconnected
                }
              }
            }

            // Periodic persist every 5s
            if (Date.now() - lastPersist > 5000) {
              lastPersist = Date.now();
              updateMessage(workspaceDir, threadId, assistantMsg.id, {
                content: accumulatedContent,
                ...(accumulatedToolCalls.length > 0 ? { toolCalls: accumulatedToolCalls } : {}),
                ...(accumulatedBlocks.length > 0 ? { contentBlocks: accumulatedBlocks } : {}),
              }).catch(() => {});
            }
          },
          // onClose
          (code) => {
            const status = code === 0 ? "complete" : "error";
            if (clientDisconnected && status === "complete") {
              addUnreadAgent(workspaceDir, threadId, agentId).catch(() => {});
            }
            // Mark any still-running tool calls as complete (or error)
            for (const tc of accumulatedToolCalls) {
              if (tc.status === "running") {
                tc.status = status === "error" ? "error" : "complete";
              }
            }

            // Parse and strip <QuickReply> tags from content
            let finalContent = accumulatedContent;
            let inlineSuggestions: string[] = [];
            if (status === "complete") {
              const parsed = parseQuickReplies(accumulatedContent);
              finalContent = parsed.cleaned;
              inlineSuggestions = parsed.suggestions;
              // Also clean the last text block
              if (parsed.cleaned !== accumulatedContent) {
                const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1];
                if (lastBlock && lastBlock.type === "text") {
                  const blockParsed = parseQuickReplies(lastBlock.text);
                  lastBlock.text = blockParsed.cleaned;
                }
              }
            }

            updateMessage(workspaceDir, threadId, assistantMsg.id, {
              content: finalContent || (status === "error" ? `[Process exited with code ${code}]` : ""),
              status,
              ...(accumulatedToolCalls.length > 0 ? { toolCalls: accumulatedToolCalls } : {}),
              ...(accumulatedBlocks.length > 0 ? { contentBlocks: accumulatedBlocks } : {}),
              ...(inlineSuggestions.length > 0 ? { suggestions: inlineSuggestions } : {}),
              ...(accumulatedDenials.length > 0 ? { permissionDenials: accumulatedDenials } : {}),
            }).catch(() => {});

            try {
              if (inlineSuggestions.length > 0) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "suggestions", suggestions: inlineSuggestions })}\n\n`));
              }

              // Auto-dispatch: if thread has a coordinator and this agent's response @mentions other agents
              if (status === "complete" && thread.coordinatorId && finalContent) {
                const mentionedAgents = parseMentions(finalContent, allAgents);
                // Filter out self-mentions — only dispatch to other agents or allow self-loop
                const dispatchAgents = mentionedAgents.map((a) => ({ id: a.id, name: a.name }));
                if (dispatchAgents.length > 0) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: "auto_dispatch",
                    agents: dispatchAgents,
                    sourceAgentId: agent.id,
                    sourceAgentName: agent.name,
                    limit: thread.maxAutoDispatches ?? 50,
                  })}\n\n`));
                }
              }

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", status })}\n\n`));
              controller.close();
            } catch {
              // Already closed
            }
          },
          // onError
          (err: Error) => {
            const errorContent = accumulatedContent
              ? `${accumulatedContent}\n\n[Error: ${err.message}]`
              : `[Error: ${err.message}]`;
            updateMessage(workspaceDir, threadId, assistantMsg.id, {
              content: errorContent,
              status: "error",
            }).catch(() => {});

            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`));
              controller.close();
            } catch {
              // Already closed
            }
          },
          hasHistory,
          effectivePersonality,
          imagePaths.length > 0 ? imagePaths : undefined,
          fullHistoryPrompt,
          permissionLevel,
          threadPaths.length > 0 ? threadPaths : undefined,
          mcpConfigPath
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        updateMessage(workspaceDir, threadId, assistantMsg.id, {
          content: `[Error: ${message}]`,
          status: "error",
        }).catch(() => {});
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Encoding": "none",
      "X-Accel-Buffering": "no",
    },
  });
}
