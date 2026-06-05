import { routeWithJson, badRequest } from "@/lib/api-route";
import { loadTts } from "@/lib/agent-store";
import { DEFAULT_VOICE_ID, getVoiceInfo } from "@/lib/piper-installer";
import { synthesizeWav, PiperUnavailableError, PiperSynthesisError } from "@/lib/piper-tts";

const MAX_TEXT_LENGTH = 5000;
const SYNTHESIS_TIMEOUT_MS = 30_000;

type TtsBody = { text?: unknown; voiceId?: unknown };

export const POST = routeWithJson<Record<string, never>, TtsBody>(async ({ body }) => {
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    throw badRequest("Missing 'text'");
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return new Response(
      JSON.stringify({ error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    );
  }

  const requestedVoice = typeof body.voiceId === "string" && body.voiceId.trim() ? body.voiceId.trim() : undefined;
  const tts = await loadTts();
  const voiceId = requestedVoice ?? tts.piperVoice ?? DEFAULT_VOICE_ID;
  if (!getVoiceInfo(voiceId)) {
    throw badRequest(`Unknown voice: ${voiceId}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNTHESIS_TIMEOUT_MS);

  try {
    const wav = await synthesizeWav({ text, voiceId, signal: controller.signal });
    return new Response(new Uint8Array(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof PiperUnavailableError) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
    if (controller.signal.aborted) {
      return new Response(
        JSON.stringify({ error: "Synthesis timed out" }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }
    if (err instanceof PiperSynthesisError) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
});
