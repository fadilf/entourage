import { NextResponse } from "next/server";
import { getTerminalManager } from "@/lib/terminal-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { sessionId, cols, rows } = body;

  if (!sessionId || typeof cols !== "number" || typeof rows !== "number") {
    return NextResponse.json({ error: "sessionId, cols, and rows are required" }, { status: 400 });
  }

  const tm = getTerminalManager();
  const ok = tm.resize(sessionId, cols, rows);

  if (!ok) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
