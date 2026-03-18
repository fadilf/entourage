import { NextResponse } from "next/server";
import { resolveWorkspaceDir } from "@/lib/workspace-context";
import fs from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

const LANGUAGE_MAP: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
  py: "Python", rs: "Rust", go: "Go", java: "Java", rb: "Ruby",
  css: "CSS", scss: "SCSS", html: "HTML", json: "JSON", yaml: "YAML",
  yml: "YAML", md: "Markdown", sh: "Shell", bash: "Shell", zsh: "Shell",
  sql: "SQL", toml: "TOML", xml: "XML", svg: "SVG", c: "C", cpp: "C++",
  h: "C", hpp: "C++", cs: "C#", swift: "Swift", kt: "Kotlin",
  dockerfile: "Dockerfile", makefile: "Makefile",
};

function getLanguage(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();
  if (LANGUAGE_MAP[base]) return LANGUAGE_MAP[base]; // e.g. "Dockerfile"
  const ext = base.split(".").pop() ?? "";
  return LANGUAGE_MAP[ext] ?? "Plain Text";
}

export async function GET(request: Request) {
  let dir: string;
  try {
    dir = await resolveWorkspaceDir(request);
  } catch {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  const url = new URL(request.url);
  const relativePath = url.searchParams.get("path") || "";

  if (!relativePath) {
    return NextResponse.json({ error: "path parameter is required" }, { status: 400 });
  }

  // Path traversal protection
  if (relativePath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const resolved = path.resolve(dir, relativePath);
  if (!resolved.startsWith(dir + path.sep) && resolved !== dir) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const stat = await fs.stat(resolved);

    if (stat.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum is 1MB.` },
        { status: 400 }
      );
    }

    // Read first 8KB to check for binary content
    const fd = await fs.open(resolved, "r");
    const probe = Buffer.alloc(Math.min(8192, stat.size));
    await fd.read(probe, 0, probe.length, 0);
    await fd.close();

    if (probe.includes(0)) {
      return NextResponse.json({ error: "Binary file — preview not available" }, { status: 400 });
    }

    const content = await fs.readFile(resolved, "utf-8");
    const language = getLanguage(relativePath);

    return NextResponse.json({ content, language, size: stat.size });
  } catch {
    return NextResponse.json({ error: "Cannot read file" }, { status: 500 });
  }
}
