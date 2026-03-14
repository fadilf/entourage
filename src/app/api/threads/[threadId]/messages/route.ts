import { NextResponse } from "next/server";
import { getThread, addMessage } from "@/lib/thread-store";
import { parseMentions } from "@/lib/mentions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const thread = await getThread(threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { content } = (await request.json()) as { content: string };
  if (!content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  const message = await addMessage(threadId, {
    role: "user",
    content,
    timestamp: new Date().toISOString(),
    status: "complete",
  });

  // Parse @mentions to determine which agents to target
  const mentionedAgents = parseMentions(content, thread.agents);
  const targetAgents = mentionedAgents.length > 0
    ? mentionedAgents
    : [thread.agents[0]]; // Default to first agent

  return NextResponse.json({ message, targetAgents });
}
