import { NextResponse } from "next/server";
import { getThread, deleteThread, updateThreadTitle, archiveThread } from "@/lib/thread-store";
import { getProcessManager } from "@/lib/process-manager";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const thread = await getThread(threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = await request.json();

  if (typeof body.archived === "boolean") {
    const thread = await archiveThread(threadId, body.archived);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json(thread);
  }

  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const thread = await updateThreadTitle(threadId, body.title.trim());
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const pm = getProcessManager();
  // Kill any running processes for this thread
  const thread = await getThread(threadId);
  if (thread) {
    for (const agent of thread.agents) {
      pm.kill(threadId, agent.id);
    }
  }
  await deleteThread(threadId);
  return NextResponse.json({ ok: true });
}
