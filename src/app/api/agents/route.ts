import { NextResponse } from "next/server";
import { loadAgents, createAgent } from "@/lib/agent-store";

export async function GET() {
  const agents = await loadAgents();
  return NextResponse.json(agents);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, model, avatarColor, icon, personality } = body;

  if (!name || !model || !avatarColor) {
    return NextResponse.json({ error: "name, model, and avatarColor are required" }, { status: 400 });
  }

  try {
    const agent = await createAgent({ name, model, avatarColor, icon, personality });
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
