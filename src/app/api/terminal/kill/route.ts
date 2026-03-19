import { NextResponse } from "next/server";
import { getTerminalManager } from "@/lib/terminal-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { sessionId } = body;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const tm = getTerminalManager();
  tm.kill(sessionId);

  return NextResponse.json({ ok: true });
}
