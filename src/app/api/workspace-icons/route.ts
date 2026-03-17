import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";

const ICONS_DIR = path.join(os.homedir(), ".entourage", "workspace-icons");
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return map[mime] ?? "png";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type: ${file.type}. Allowed: png, jpg, gif, webp` },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Max 2MB" },
      { status: 400 }
    );
  }

  await mkdir(ICONS_DIR, { recursive: true });

  const imageId = crypto.randomUUID();
  const ext = extFromMime(file.type);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(ICONS_DIR, `${imageId}.${ext}`), buffer);

  return NextResponse.json({ imageId, ext });
}
