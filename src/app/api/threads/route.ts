import { NextResponse } from "next/server";
import { listThreads, createThread } from "@/lib/thread-store";
import { loadAgents } from "@/lib/agent-store";
import { resolveWorkspaceDir } from "@/lib/workspace-context";
import { Agent } from "@/lib/types";

export async function GET(request: Request) {
  const workspaceDir = await resolveWorkspaceDir(request);
  const threads = await listThreads(workspaceDir);
  return NextResponse.json(threads);
}

export async function POST(request: Request) {
  const workspaceDir = await resolveWorkspaceDir(request);
  const body = await request.json();
  const { title, agentIds } = body as { title: string; agentIds: string[] };

  if (!title || !agentIds?.length) {
    return NextResponse.json({ error: "title and agentIds required" }, { status: 400 });
  }

  const allAgents = await loadAgents();
  const agents: Agent[] = agentIds
    .map((id: string) => allAgents.find((a) => a.id === id))
    .filter((a): a is Agent => a !== undefined);

  if (!agents.length) {
    return NextResponse.json({ error: "No valid agents specified" }, { status: 400 });
  }

  const thread = await createThread(workspaceDir, title, agents);
  return NextResponse.json(thread, { status: 201 });
}
