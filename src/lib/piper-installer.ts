import { mkdir, rename, rm, stat, readdir } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";

const PIPER_VERSION = "2023.11.14-2";
const PIPER_BASE = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}`;
export const PIPER_WINDOWS_URL = `${PIPER_BASE}/piper_windows_amd64.zip`;

const VOICES_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main";

type VoiceInfo = {
  id: string;
  onnxUrl: string;
  jsonUrl: string;
  onnxSha256: string;
  jsonSha256: string;
  sampleRate: number;
};

export const VOICES: Record<string, VoiceInfo> = {
  "en_US-norman-medium": {
    id: "en_US-norman-medium",
    onnxUrl: `${VOICES_BASE}/en/en_US/norman/medium/en_US-norman-medium.onnx`,
    jsonUrl: `${VOICES_BASE}/en/en_US/norman/medium/en_US-norman-medium.onnx.json`,
    onnxSha256: "b9739443232a80a59c7d18810dd856899bf16a7964725f5ab81ea49b1351cb71",
    jsonSha256: "6c2db7f558a4a8deb9fe822583c1c5105f6c4e834dd0f9de8ad17a888ee9fe1d",
    sampleRate: 22050,
  },
};

export const EXPECTED_PIPER_ZIP_SHA256 = "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea";

export const DEFAULT_VOICE_ID = "en_US-norman-medium";

const ENTOURAGE_DIR = path.join(os.homedir(), ".entourage");
const PIPER_DIR = path.join(ENTOURAGE_DIR, "piper");
const PIPER_BIN = path.join(PIPER_DIR, "piper.exe");
const MODELS_DIR = path.join(ENTOURAGE_DIR, "piper-models");

export function getPiperPaths() {
  return { dir: PIPER_DIR, bin: PIPER_BIN, modelsDir: MODELS_DIR };
}

export function getAvailableVoices(): string[] {
  return Object.keys(VOICES);
}

export function getVoiceInfo(voiceId: string): VoiceInfo | null {
  return VOICES[voiceId] ?? null;
}

export function getVoiceModelPaths(voiceId: string): { onnx: string; json: string } | null {
  if (!VOICES[voiceId]) return null;
  return {
    onnx: path.join(MODELS_DIR, `${voiceId}.onnx`),
    json: path.join(MODELS_DIR, `${voiceId}.onnx.json`),
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isPiperInstalled(): Promise<boolean> {
  return fileExists(PIPER_BIN);
}

export async function isVoiceInstalled(voiceId: string): Promise<boolean> {
  const paths = getVoiceModelPaths(voiceId);
  if (!paths) return false;
  return (await fileExists(paths.onnx)) && (await fileExists(paths.json));
}

export async function listInstalledVoices(): Promise<string[]> {
  const out: string[] = [];
  for (const id of Object.keys(VOICES)) {
    if (await isVoiceInstalled(id)) out.push(id);
  }
  return out;
}

export type InstallProgress =
  | { stage: "download-binary"; bytesReceived: number; bytesTotal: number }
  | { stage: "verify-binary" }
  | { stage: "extract" }
  | { stage: "download-voice"; voiceId: string; file: "onnx" | "json"; bytesReceived: number; bytesTotal: number }
  | { stage: "verify-voice"; voiceId: string }
  | { stage: "done" };

type OnProgress = (event: InstallProgress) => void;

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function isExpectedHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

async function verifyChecksum(filePath: string, expected: string, label: string): Promise<void> {
  if (!isExpectedHash(expected)) {
    console.warn(`[piper-installer] Skipping checksum verification for ${label}: no hash pinned yet.`);
    return;
  }
  const actual = await sha256File(filePath);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    await rm(filePath, { force: true });
    throw new Error(`Checksum mismatch for ${label}. Expected ${expected}, got ${actual}.`);
  }
}

async function downloadWithProgress(
  url: string,
  dest: string,
  onProgress: (e: { bytesReceived: number; bytesTotal: number }) => void,
  signal?: AbortSignal
): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { signal, redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  }
  const total = Number(res.headers.get("content-length") ?? 0);
  let received = 0;
  const out = createWriteStream(dest);
  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      onProgress({ bytesReceived: received, bytesTotal: total });
      if (!out.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => out.once("drain", () => resolve()));
      }
    }
  } finally {
    out.end();
    await new Promise<void>((resolve, reject) => {
      out.once("finish", () => resolve());
      out.once("error", reject);
    });
  }
}

async function runPowerShell(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ...args], {
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PowerShell failed (${code}): ${stderr.trim()}`));
    });
    if (signal) {
      const onAbort = () => child.kill();
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

async function expandArchive(zipPath: string, destDir: string, signal?: AbortSignal): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await runPowerShell(
    [`Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`],
    signal
  );
}

async function findPiperRoot(stageDir: string): Promise<string> {
  if (await fileExists(path.join(stageDir, "piper.exe"))) return stageDir;
  const entries = await readdir(stageDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const candidate = path.join(stageDir, entry.name);
      if (await fileExists(path.join(candidate, "piper.exe"))) return candidate;
    }
  }
  throw new Error("piper.exe not found in extracted archive");
}

export async function installPiper(onProgress: OnProgress, signal?: AbortSignal): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Piper auto-install is only supported on Windows.");
  }

  await mkdir(ENTOURAGE_DIR, { recursive: true });
  const zipPath = path.join(ENTOURAGE_DIR, `piper-${PIPER_VERSION}.zip`);
  const stageDir = path.join(ENTOURAGE_DIR, `piper-staging-${Date.now()}`);

  if (!(await isPiperInstalled())) {
    await downloadWithProgress(
      PIPER_WINDOWS_URL,
      zipPath,
      (e) => onProgress({ stage: "download-binary", bytesReceived: e.bytesReceived, bytesTotal: e.bytesTotal }),
      signal
    );

    onProgress({ stage: "verify-binary" });
    await verifyChecksum(zipPath, EXPECTED_PIPER_ZIP_SHA256, "piper-windows-zip");

    onProgress({ stage: "extract" });
    await expandArchive(zipPath, stageDir, signal);
    const piperRoot = await findPiperRoot(stageDir);

    await rm(PIPER_DIR, { recursive: true, force: true });
    await rename(piperRoot, PIPER_DIR);
    await rm(stageDir, { recursive: true, force: true });
    await rm(zipPath, { force: true });
  }

  await downloadVoice(DEFAULT_VOICE_ID, onProgress, signal);

  onProgress({ stage: "done" });
}

export async function downloadVoice(voiceId: string, onProgress: OnProgress, signal?: AbortSignal): Promise<void> {
  const info = getVoiceInfo(voiceId);
  if (!info) throw new Error(`Unknown voice: ${voiceId}`);
  const paths = getVoiceModelPaths(voiceId)!;

  if (await isVoiceInstalled(voiceId)) return;

  await mkdir(MODELS_DIR, { recursive: true });

  if (!(await fileExists(paths.onnx))) {
    await downloadWithProgress(
      info.onnxUrl,
      paths.onnx,
      (e) => onProgress({ stage: "download-voice", voiceId, file: "onnx", bytesReceived: e.bytesReceived, bytesTotal: e.bytesTotal }),
      signal
    );
  }
  if (!(await fileExists(paths.json))) {
    await downloadWithProgress(
      info.jsonUrl,
      paths.json,
      (e) => onProgress({ stage: "download-voice", voiceId, file: "json", bytesReceived: e.bytesReceived, bytesTotal: e.bytesTotal }),
      signal
    );
  }

  onProgress({ stage: "verify-voice", voiceId });
  await verifyChecksum(paths.onnx, info.onnxSha256, `${voiceId}.onnx`);
  await verifyChecksum(paths.json, info.jsonSha256, `${voiceId}.onnx.json`);
}
