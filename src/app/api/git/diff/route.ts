import { NextResponse } from "next/server";
import { resolveWorkspaceDir } from "@/lib/workspace-context";
import simpleGit from "simple-git";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(request: Request) {
  let dir: string;
  try {
    dir = await resolveWorkspaceDir(request);
  } catch {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  const url = new URL(request.url);
  const file = url.searchParams.get("file");
  const staged = url.searchParams.get("staged") === "true";

  if (!file) {
    return NextResponse.json({ error: "file parameter required" }, { status: 400 });
  }

  const git = simpleGit(dir);

  try {
    let diff: string;

    if (staged) {
      diff = await git.diff(["--cached", "--find-renames", "--", file]);
    } else {
      diff = await git.diff(["--find-renames", "--", file]);

      if (!diff) {
        try {
          const content = await readFile(path.join(dir, file), "utf-8");
          const lines = content.split("\n");
          diff = `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n` +
            lines.map((l) => `+${l}`).join("\n");
        } catch {
          diff = "";
        }
      }
    }

    return NextResponse.json({ diff });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Git error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
