import { NextResponse } from "next/server";
import { reorderAgents } from "@/lib/agent-store";

export async function PUT(request: Request) {
  const { orderedIds } = (await request.json()) as { orderedIds: string[] };

  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: "orderedIds must be an array" }, { status: 400 });
  }

  try {
    const agents = await reorderAgents(orderedIds);
    return NextResponse.json(agents);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
