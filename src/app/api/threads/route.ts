import { NextResponse } from "next/server";
import { listThreads, createThread } from "@/lib/thread-store";
import { loadAgents } from "@/lib/agent-store";
import { Agent } from "@/lib/types";

export async function GET() {
  const threads = await listThreads();
  return NextResponse.json(threads);
}

export async function POST(request: Request) {
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

  const thread = await createThread(title, agents);
  return NextResponse.json(thread, { status: 201 });
}
