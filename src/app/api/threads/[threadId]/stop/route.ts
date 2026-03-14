import { NextResponse } from "next/server";
import { getProcessManager } from "@/lib/process-manager";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { agentId } = (await request.json()) as { agentId: string };

  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  const pm = getProcessManager();
  pm.kill(threadId, agentId);

  return NextResponse.json(pm.getStatus(threadId, agentId));
}
