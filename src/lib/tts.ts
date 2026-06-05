import { useSyncExternalStore } from "react";

export type TtsEngine = "web" | "piper";
export type TtsConfig = { engine: TtsEngine; piperVoice?: string };

type TtsState = { messageId: string | null };
type Listener = () => void;

type StoreShape = {
  state: TtsState;
  listeners: Set<Listener>;
  config: TtsConfig | null;
  configLoading: Promise<TtsConfig> | null;
  activeAudio: HTMLAudioElement | null;
  activeAbort: AbortController | null;
  activeUrl: string | null;
};

type Globals = typeof globalThis & { __entourageTts?: StoreShape };

function getStore(): StoreShape {
  const g = globalThis as Globals;
  const existing = g.__entourageTts as Partial<StoreShape> | undefined;
  if (!existing || !("config" in existing)) {
    g.__entourageTts = {
      state: existing?.state ?? { messageId: null },
      listeners: existing?.listeners ?? new Set(),
      config: null,
      configLoading: null,
      activeAudio: null,
      activeAbort: null,
      activeUrl: null,
    };
  }
  return g.__entourageTts!;
}

function setSpeaking(messageId: string | null) {
  const store = getStore();
  if (store.state.messageId === messageId) return;
  store.state = { messageId };
  store.listeners.forEach((l) => l());
}

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

async function ensureConfig(): Promise<TtsConfig> {
  const store = getStore();
  if (store.config) return store.config;
  if (store.configLoading) return store.configLoading;
  store.configLoading = (async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        const config: TtsConfig = data.tts && typeof data.tts === "object"
          ? { engine: data.tts.engine === "piper" ? "piper" : "web", piperVoice: data.tts.piperVoice }
          : { engine: "web" };
        store.config = config;
        return config;
      }
    } catch {
      // fall through to default
    }
    const fallback: TtsConfig = { engine: "web" };
    store.config = fallback;
    return fallback;
  })();
  return store.configLoading;
}

export function refreshTtsConfig(config?: TtsConfig | null) {
  const store = getStore();
  if (config) {
    store.config = config;
  } else {
    store.config = null;
  }
  store.configLoading = null;
}

function cleanupPiper() {
  const store = getStore();
  if (store.activeAudio) {
    store.activeAudio.pause();
    store.activeAudio.src = "";
    store.activeAudio = null;
  }
  if (store.activeUrl) {
    URL.revokeObjectURL(store.activeUrl);
    store.activeUrl = null;
  }
  if (store.activeAbort) {
    store.activeAbort.abort();
    store.activeAbort = null;
  }
}

function cleanupAll() {
  cleanupPiper();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export function stop() {
  cleanupAll();
  setSpeaking(null);
}

export async function speak(messageId: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  cleanupAll();
  setSpeaking(messageId);

  const config = await ensureConfig();
  if (getStore().state.messageId !== messageId) return;

  if (config.engine === "piper") {
    try {
      await playWithPiper(messageId, trimmed, config);
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        console.error("Piper TTS failed:", err);
      }
      if (getStore().state.messageId === messageId) setSpeaking(null);
    }
  } else {
    playWithWebSpeech(messageId, trimmed);
  }
}

function playWithWebSpeech(messageId: string, text: string) {
  if (!isTtsSupported()) {
    setSpeaking(null);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  const clearIfActive = () => {
    if (getStore().state.messageId === messageId) setSpeaking(null);
  };
  utterance.onend = clearIfActive;
  utterance.onerror = clearIfActive;
  window.speechSynthesis.speak(utterance);
}

async function playWithPiper(messageId: string, text: string, config: TtsConfig): Promise<void> {
  const store = getStore();
  const abort = new AbortController();
  store.activeAbort = abort;

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId: config.piperVoice }),
    signal: abort.signal,
  });

  if (getStore().state.messageId !== messageId) return;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`TTS request failed: ${res.status} ${detail}`);
  }

  const blob = await res.blob();
  if (getStore().state.messageId !== messageId) return;

  const url = URL.createObjectURL(blob);
  store.activeUrl = url;
  const audio = new Audio(url);
  store.activeAudio = audio;

  const clearIfActive = () => {
    if (getStore().state.messageId === messageId) setSpeaking(null);
  };
  audio.onended = clearIfActive;
  audio.onerror = clearIfActive;

  try {
    await audio.play();
  } catch (err) {
    clearIfActive();
    throw err;
  }
}

function subscribe(listener: Listener) {
  const store = getStore();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function getSnapshot() {
  return getStore().state.messageId;
}

function getServerSnapshot() {
  return null;
}

export function useSpeakingMessageId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function stripMarkdownForSpeech(content: string): string {
  let s = content;
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]*)`/g, "$1");
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*\d+\.\s+/gm, "");
  s = s.replace(/^\s*([-*_])\1{2,}\s*$/gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "$1");
  s = s.replace(/~~([^~]+)~~/g, "$1");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
