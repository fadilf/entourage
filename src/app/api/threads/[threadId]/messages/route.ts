import { NextResponse } from "next/server";
import { getThread, addMessage, syncThreadAgents } from "@/lib/thread-store";
import { loadAgents } from "@/lib/agent-store";
import { parseMentions } from "@/lib/mentions";
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

  const { content, images } = (await request.json()) as { content: string; images?: import("@/lib/types").MessageImage[] };
  if (!content?.trim() && (!images || images.length === 0)) {
    return NextResponse.json({ error: "content or images required" }, { status: 400 });
  }

  const message = await addMessage(workspaceDir, threadId, {
    role: "user",
    content: content || "",
    timestamp: new Date().toISOString(),
    status: "complete",
    ...(images && images.length > 0 ? { images } : {}),
  });

  // Parse @mentions against all available agents
  const allAgents = await loadAgents();
  const mentionedAgents = parseMentions(content, allAgents);
  const targetAgents = mentionedAgents.length > 0
    ? mentionedAgents
    : [thread.agents[0]]; // Default to first agent

  const activeAgent = targetAgents[targetAgents.length - 1];
  const { thread: updatedThread, changed: threadUpdated } =
    targetAgents.length > 0 && activeAgent
      ? await syncThreadAgents(workspaceDir, threadId, targetAgents, activeAgent.id)
      : { thread, changed: false };

  return NextResponse.json({
    message,
    targetAgents,
    threadUpdated,
    thread: updatedThread,
  });
}
