import { NextResponse } from "next/server";
import { resolveWorkspaceDir } from "@/lib/workspace-context";
import simpleGit from "simple-git";
import { GitFileEntry, GitStatus } from "@/lib/types";
import { mapGitStatus } from "@/lib/plugins";

export async function GET(request: Request) {
  let dir: string;
  try {
    dir = await resolveWorkspaceDir(request);
  } catch {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  const git = simpleGit(dir);

  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return NextResponse.json({ isRepo: false, branch: "", staged: [], unstaged: [] } satisfies GitStatus);
    }

    const status = await git.status();

    const staged: GitFileEntry[] = [];
    const unstaged: GitFileEntry[] = [];

    for (const file of status.files) {
      if (file.index && file.index !== " " && file.index !== "?") {
        staged.push({
          path: file.path,
          status: mapGitStatus(file.index),
        });
      }
      if (file.working_dir && file.working_dir !== " ") {
        unstaged.push({
          path: file.path,
          status: file.working_dir === "?" ? "untracked" : mapGitStatus(file.working_dir),
        });
      }
    }

    return NextResponse.json({
      isRepo: true,
      branch: status.current ?? "",
      staged,
      unstaged,
    } satisfies GitStatus);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Git error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
