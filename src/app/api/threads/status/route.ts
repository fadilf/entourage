import { NextResponse } from "next/server";
import { getProcessManager } from "@/lib/process-manager";
import { listThreads } from "@/lib/thread-store";
import { resolveWorkspaceDir } from "@/lib/workspace-context";

export async function GET(request: Request) {
  const pm = getProcessManager();
  const statuses = pm.getAllStatuses();

  const workspaceDir = await resolveWorkspaceDir(request);
  const threads = await listThreads(workspaceDir);

  const unreadByThread: Record<string, string[]> = {};
  for (const t of threads) {
    if (t.unreadAgents && t.unreadAgents.length > 0) {
      unreadByThread[t.id] = t.unreadAgents;
    }
  }

  return NextResponse.json({ statuses, unreadByThread });
}
