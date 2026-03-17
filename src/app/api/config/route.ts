import { NextResponse } from "next/server";
import { loadAgents, loadDisplayName, saveDisplayName } from "@/lib/agent-store";

export async function GET() {
  const [agents, displayName] = await Promise.all([
    loadAgents(),
    loadDisplayName(),
  ]);
  return NextResponse.json({ agents, displayName });
}

export async function PATCH(request: Request) {
  const body = await request.json();

  if (typeof body.displayName === "string") {
    await saveDisplayName(body.displayName.trim());
  }

  const displayName = await loadDisplayName();
  return NextResponse.json({ displayName });
}
