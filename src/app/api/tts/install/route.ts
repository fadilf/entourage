import { installPiper, downloadVoice, getVoiceInfo, DEFAULT_VOICE_ID, isPiperInstalled, type InstallProgress } from "@/lib/piper-installer";

type InstallEvent = InstallProgress | { stage: "error"; message: string };

type InstallBody = { voiceId?: unknown };

export async function POST(request: Request): Promise<Response> {
  let voiceId = DEFAULT_VOICE_ID;
  try {
    const raw = await request.json() as InstallBody;
    if (typeof raw.voiceId === "string" && raw.voiceId.trim()) {
      voiceId = raw.voiceId.trim();
    }
  } catch {
    // empty body → use defaults
  }

  if (!getVoiceInfo(voiceId)) {
    return new Response(
      JSON.stringify({ error: `Unknown voice: ${voiceId}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const send = (event: InstallEvent) => {
        streamController.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        if (!(await isPiperInstalled())) {
          await installPiper(send, controller.signal);
        } else {
          await downloadVoice(voiceId, send, controller.signal);
          send({ stage: "done" });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ stage: "error", message });
      } finally {
        streamController.close();
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
