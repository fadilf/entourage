import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";

const ICONS_DIR = path.join(os.homedir(), ".entourage", "workspace-icons");
const VALID_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const { imageId } = await params;
  const url = new URL(request.url);
  const ext = url.searchParams.get("ext") || "png";

  if (!VALID_EXTS.has(ext)) {
    return NextResponse.json({ error: "Invalid extension" }, { status: 400 });
  }

  // Validate imageId is a UUID to prevent path traversal
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(imageId)) {
    return NextResponse.json({ error: "Invalid image ID" }, { status: 400 });
  }

  try {
    const filePath = path.join(ICONS_DIR, `${imageId}.${ext}`);
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": MIME_MAP[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Icon not found" }, { status: 404 });
  }
}
