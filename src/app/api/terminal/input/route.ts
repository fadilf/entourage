import { NextResponse } from "next/server";
import { getTerminalManager } from "@/lib/terminal-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { sessionId, data } = body;

  if (!sessionId || typeof data !== "string") {
    return NextResponse.json({ error: "sessionId and data are required" }, { status: 400 });
  }

  const tm = getTerminalManager();
  const ok = tm.write(sessionId, data);

  if (!ok) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
