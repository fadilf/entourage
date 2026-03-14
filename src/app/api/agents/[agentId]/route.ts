import { NextResponse } from "next/server";
import { updateAgent, deleteAgent } from "@/lib/agent-store";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const updates = await request.json();

  try {
    const agent = await updateAgent(agentId, updates);
    return NextResponse.json(agent);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  try {
    await deleteAgent(agentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
