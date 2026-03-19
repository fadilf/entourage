import { NextResponse } from "next/server";
import { getTerminalManager } from "@/lib/terminal-manager";
import { resolveWorkspaceDir } from "@/lib/workspace-context";
import crypto from "crypto";

export async function POST(request: Request) {
  let dir: string;
  try {
    dir = await resolveWorkspaceDir(request);
  } catch {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const sessionId = body.sessionId || crypto.randomUUID();
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId") || "";

  const tm = getTerminalManager();

  // Check if session already exists
  const existing = tm.getSession(sessionId);
  if (existing) {
    return NextResponse.json({ sessionId, reattached: true });
  }

  tm.spawn(sessionId, workspaceId, dir);
  return NextResponse.json({ sessionId });
}
