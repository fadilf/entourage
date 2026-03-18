import { NextResponse } from "next/server";
import { getThread, addMessage, updateMessage, addUnreadAgent } from "@/lib/thread-store";
import { getProcessManager } from "@/lib/process-manager";
import { createStreamParser } from "@/lib/stream-parser";
import { AgentModel, MessageImage, ToolCall, ContentBlock } from "@/lib/types";
import { loadAgents, loadQuickRepliesConfig } from "@/lib/agent-store";
import { buildContextualPrompt, buildFullHistoryPrompt } from "@/lib/context";
import { QUICK_REPLY_INSTRUCTION, parseQuickReplies } from "@/lib/quick-replies";
import { stripMentions } from "@/lib/mentions";
import path from "path";
import { getUploadsDir } from "@/lib/config";
import { resolveWorkspaceDir } from "@/lib/workspace-context";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const workspaceDir = await resolveWorkspaceDir(request);
  const { threadId } = await params;
  const thread = await getThread(workspaceDir, threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { agentId, prompt, images } = (await request.json()) as { agentId: string; prompt: string; images?: MessageImage[] };

  // Resolve image paths
  const imagePaths = images?.map((img) => path.join(getUploadsDir(workspaceDir), img.filename)) ?? [];

  // Resolve fresh agent data from store (picks up personality edits)
  const allAgents = await loadAgents();
  const freshAgent = allAgents.find((a) => a.id === agentId);
  // Fall back to thread-stored agent data if agent was deleted
  const agent = freshAgent ?? thread.agents.find((a) => a.id === agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not in thread" }, { status: 400 });
  }

  const pm = getProcessManager();

  // Check if already running — re-attach
  const existing = pm.getProcess(threadId, agentId);
  if (existing) {
    // Return existing buffer as SSE stream then continue piping
    const reattachParser = createStreamParser(agent.model as AgentModel);
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let clientDisconnected = false;
        request.signal.addEventListener("abort", () => {
          clientDisconnected = true;
        });

        // Send in-memory accumulated content (avoids gap from periodic persist)
        if (existing.accumulatedContent) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "initial", content: existing.accumulatedContent })}\n\n`)
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

  // Check if this agent already has completed assistant messages (for --resume)
  const hasHistory = thread.messages.some(
    (m) => m.role === "assistant" && m.agentId === agent.id && m.status === "complete"
  );

  // Load quick replies config to append instruction to personality
  const quickRepliesConfig = await loadQuickRepliesConfig();
  const quickRepliesEnabled = quickRepliesConfig.enabled;
  const effectivePersonality = quickRepliesEnabled
    ? (agent.personality ?? "") + QUICK_REPLY_INSTRUCTION
    : agent.personality;

  const cleanPrompt = stripMentions(prompt, thread.agents);
  const enrichedPrompt = buildContextualPrompt(thread.messages, agent.id, thread.agents, cleanPrompt);
  // Build full history prompt for fallback when --resume fails (session lost)
  const fullHistoryPrompt = hasHistory
    ? buildFullHistoryPrompt(thread.messages, agent.id, thread.agents, cleanPrompt)
    : undefined;

  let accumulatedContent = "";
  const accumulatedToolCalls: ToolCall[] = [];
  const accumulatedBlocks: ContentBlock[] = [];
  let lastPersist = Date.now();
  const parser = createStreamParser(agent.model as AgentModel);

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
          agent.model as AgentModel,
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
                if (proc) proc.accumulatedContent = accumulatedContent;
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
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch { /* Client disconnected */ }
              } else if (event.type === "tool_result") {
                const tc = accumulatedToolCalls.find((t) => t.id === event.toolId);
                if (tc) {
                  tc.status = "complete";
                  tc.output = event.output;
                }
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
            if (quickRepliesEnabled && status === "complete") {
              const parsed = parseQuickReplies(accumulatedContent);
              finalContent = parsed.cleaned;
              inlineSuggestions = parsed.suggestions;
              // Also clean the last text block
              if (parsed.suggestions.length > 0) {
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
            }).catch(() => {});

            try {
              if (inlineSuggestions.length > 0) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "suggestions", suggestions: inlineSuggestions })}\n\n`));
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
          fullHistoryPrompt
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
    },
  });
}
