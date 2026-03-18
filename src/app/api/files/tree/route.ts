import { NextResponse } from "next/server";
import { resolveWorkspaceDir } from "@/lib/workspace-context";
import fs from "fs/promises";
import path from "path";

const HIDDEN_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".next", "dist",
  ".cache", ".turbo", "coverage", ".nyc_output", ".parcel-cache",
]);

export async function GET(request: Request) {
  let dir: string;
  try {
    dir = await resolveWorkspaceDir(request);
  } catch {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  const url = new URL(request.url);
  const relativePath = url.searchParams.get("path") || "";
  const showHidden = url.searchParams.get("showHidden") === "true";

  // Path traversal protection
  if (relativePath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const resolved = path.resolve(dir, relativePath);
  if (!resolved.startsWith(dir + path.sep) && resolved !== dir) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const dirents = await fs.readdir(resolved, { withFileTypes: true });
    let entries = dirents
      .filter((d) => d.isDirectory() || d.isFile())
      .filter((d) => {
        if (showHidden) return true;
        if (d.name.startsWith(".")) return false;
        if (d.isDirectory() && HIDDEN_DIRS.has(d.name)) return false;
        return true;
      })
      .map((d) => ({
        name: d.name,
        type: d.isDirectory() ? ("directory" as const) : ("file" as const),
        path: relativePath ? `${relativePath}/${d.name}` : d.name,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const truncated = entries.length > 500;
    if (truncated) entries = entries.slice(0, 500);

    return NextResponse.json({ entries, truncated });
  } catch {
    return NextResponse.json({ error: "Cannot read directory" }, { status: 500 });
  }
}
