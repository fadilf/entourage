import { NextResponse } from "next/server";
import { resolveWorkspaceDir } from "@/lib/workspace-context";
import simpleGit from "simple-git";

export async function POST(request: Request) {
  let dir: string;
  try {
    dir = await resolveWorkspaceDir(request);
  } catch {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  const { message } = await request.json();

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Commit message required" }, { status: 400 });
  }

  const git = simpleGit(dir);

  try {
    const result = await git.commit(message.trim());
    return NextResponse.json({
      hash: result.commit || "",
      message: message.trim(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Git error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
