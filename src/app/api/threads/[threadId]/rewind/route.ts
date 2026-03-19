import { NextResponse } from "next/server";
import { getProcessManager } from "@/lib/process-manager";
import { getThread, truncateAfterMessage, truncateBeforeMessage } from "@/lib/thread-store";
import { resolveWorkspaceDir } from "@/lib/workspace-context";
import { restoreSnapshot, hasSnapshot } from "@/lib/snapshots";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { messageId, keepMessage = true, revertCode = false } = (await request.json()) as {
    messageId: string;
    keepMessage?: boolean;
    revertCode?: boolean;
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

  // Optionally restore workspace files to the state before the target message
  if (revertCode) {
    const targetIndex = currentThread.messages.findIndex((m) => m.id === messageId);
    let snapshotHash: string | undefined;
    if (keepMessage) {
      // Rewinding after messageId — find the next message's snapshot
      const nextAssistant = currentThread.messages
        .slice(targetIndex + 1)
        .find((m) => m.role === "assistant" && m.snapshotTreeHash);
      snapshotHash = nextAssistant?.snapshotTreeHash;
    } else {
      // Rewinding at messageId (re-send) — use this message's snapshot if it's an assistant msg,
      // or find the next assistant message's snapshot
      const msg = currentThread.messages[targetIndex];
      if (msg?.role === "assistant" && msg.snapshotTreeHash) {
        snapshotHash = msg.snapshotTreeHash;
      } else {
        const nextAssistant = currentThread.messages
          .slice(targetIndex)
          .find((m) => m.role === "assistant" && m.snapshotTreeHash);
        snapshotHash = nextAssistant?.snapshotTreeHash;
      }
    }

    if (snapshotHash && (await hasSnapshot(workspaceDir, snapshotHash))) {
      await restoreSnapshot(workspaceDir, snapshotHash);
    }
  }

  const thread = keepMessage
    ? await truncateAfterMessage(workspaceDir, threadId, messageId)
    : await truncateBeforeMessage(workspaceDir, threadId, messageId);
  if (!thread) {
    return NextResponse.json({ error: "Thread or message not found" }, { status: 404 });
  }

  return NextResponse.json(thread);
}
