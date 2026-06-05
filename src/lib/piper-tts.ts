import { spawn } from "child_process";
import { getPiperPaths, getVoiceInfo, getVoiceModelPaths, isPiperInstalled, isVoiceInstalled } from "./piper-installer";

export class PiperUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiperUnavailableError";
  }
}

export class PiperSynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiperSynthesisError";
  }
}

function wrapPcmAsWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcm.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

export type SynthesizeOptions = {
  text: string;
  voiceId: string;
  signal?: AbortSignal;
};

export async function synthesizeWav({ text, voiceId, signal }: SynthesizeOptions): Promise<Buffer> {
  if (!(await isPiperInstalled())) {
    throw new PiperUnavailableError("Piper is not installed.");
  }
  if (!(await isVoiceInstalled(voiceId))) {
    throw new PiperUnavailableError(`Voice '${voiceId}' is not installed.`);
  }

  const info = getVoiceInfo(voiceId)!;
  const modelPaths = getVoiceModelPaths(voiceId)!;
  const { bin, dir } = getPiperPaths();

  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(bin, ["--model", modelPaths.onnx, "--output-raw"], {
      cwd: dir,
      windowsHide: true,
    });

    const chunks: Buffer[] = [];
    let stderr = "";
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const onAbort = () => {
      child.kill();
      settle(() => reject(new PiperSynthesisError("Synthesis aborted")));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (err) => settle(() => reject(new PiperSynthesisError(err.message))));
    child.on("close", (code) => {
      if (signal) signal.removeEventListener("abort", onAbort);
      if (code !== 0) {
        settle(() => reject(new PiperSynthesisError(`piper exited with ${code}: ${stderr.trim() || "(no stderr)"}`)));
        return;
      }
      const pcm = Buffer.concat(chunks);
      if (pcm.length === 0) {
        settle(() => reject(new PiperSynthesisError("piper produced no audio")));
        return;
      }
      settle(() => resolve(wrapPcmAsWav(pcm, info.sampleRate)));
    });

    child.stdin.end(text);
  });
}
