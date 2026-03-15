import { NextResponse } from "next/server";
import { getThread, deleteThread, updateThreadTitle, archiveThread, clearUnreadAgents } from "@/lib/thread-store";
import { getProcessManager } from "@/lib/process-manager";
import { resolveWorkspaceDir } from "@/lib/workspace-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const workspaceDir = await resolveWorkspaceDir(request);
  const { threadId } = await params;
  const thread = await getThread(workspaceDir, threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const workspaceDir = await resolveWorkspaceDir(request);
  const { threadId } = await params;
  const body = await request.json();

  if (body.clearUnread === true) {
    await clearUnreadAgents(workspaceDir, threadId);
    return NextResponse.json({ success: true });
  }

  if (typeof body.archived === "boolean") {
    const thread = await archiveThread(workspaceDir, threadId, body.archived);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json(thread);
  }

  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const thread = await updateThreadTitle(workspaceDir, threadId, body.title.trim());
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const workspaceDir = await resolveWorkspaceDir(request);
  const { threadId } = await params;
  const pm = getProcessManager();
  // Kill any running processes for this thread
  const thread = await getThread(workspaceDir, threadId);
  if (thread) {
    for (const agent of thread.agents) {
      pm.kill(threadId, agent.id);
    }
  }
  await deleteThread(workspaceDir, threadId);
  return NextResponse.json({ ok: true });
}
