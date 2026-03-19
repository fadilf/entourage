import { NextResponse } from "next/server";
import { getProcessManager } from "@/lib/process-manager";
import { getThread, truncateAfterMessage, truncateBeforeMessage } from "@/lib/thread-store";
import { resolveWorkspaceDir } from "@/lib/workspace-context";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { messageId, keepMessage = true } = (await request.json()) as {
    messageId: string;
    keepMessage?: boolean;
  };

  if (!messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }

  const workspaceDir = await resolveWorkspaceDir(request);
  const pm = getProcessManager();

  if (pm.isThreadStreaming(threadId)) {
    return NextResponse.json(
      { error: "Cannot rewind while agents are streaming" },
      { status: 409 }
    );
  }

  // Load thread to get agent IDs before truncating
  const currentThread = await getThread(workspaceDir, threadId);
  if (!currentThread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  pm.killByThread(threadId);
  // Reset session IDs for ALL agents so CLI starts fresh sessions (not continuing old on-disk ones)
  pm.resetSessions(threadId, currentThread.agents.map((a) => a.id));

  const thread = keepMessage
    ? await truncateAfterMessage(workspaceDir, threadId, messageId)
    : await truncateBeforeMessage(workspaceDir, threadId, messageId);
  if (!thread) {
    return NextResponse.json({ error: "Thread or message not found" }, { status: 404 });
  }

  return NextResponse.json(thread);
}
