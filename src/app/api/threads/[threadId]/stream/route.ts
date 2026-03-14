import { NextResponse } from "next/server";
import { getThread, addMessage, updateMessage } from "@/lib/thread-store";
import { getProcessManager } from "@/lib/process-manager";
import { createStreamParser } from "@/lib/stream-parser";
import { AgentModel } from "@/lib/types";
import { getWorkingDirectory } from "@/lib/thread-store";
import { loadAgents } from "@/lib/agent-store";
import { buildContextualPrompt } from "@/lib/context";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const thread = await getThread(threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { agentId, prompt } = (await request.json()) as { agentId: string; prompt: string };

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
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        // Send buffered content
        for (const chunk of existing.buffer) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "content", text: chunk })}\n\n`));
        }

        // Pipe future output
        existing.process.stdout?.on("data", (data: Buffer) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "content", text: data.toString() })}\n\n`));
          } catch {
            // Controller closed
          }
        });

        existing.process.on("close", (code) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", status: code === 0 ? "complete" : "error" })}\n\n`));
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

  // Create assistant message placeholder
  const assistantMsg = await addMessage(threadId, {
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

  const enrichedPrompt = buildContextualPrompt(thread.messages, agent.id, thread.agents, prompt);

  let accumulatedContent = "";
  let lastPersist = Date.now();
  const parser = createStreamParser(agent.model as AgentModel);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const cwd = getWorkingDirectory();

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
              updateMessage(threadId, assistantMsg.id, { content: accumulatedContent }).catch(() => {});
            }
          },
          // onClose
          (code) => {
            const status = code === 0 ? "complete" : "error";
            updateMessage(threadId, assistantMsg.id, {
              content: accumulatedContent || (status === "error" ? `[Process exited with code ${code}]` : ""),
              status,
            }).catch(() => {});

            try {
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
            updateMessage(threadId, assistantMsg.id, {
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
          agent.personality
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        updateMessage(threadId, assistantMsg.id, {
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
