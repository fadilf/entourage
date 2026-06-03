import { useSyncExternalStore } from "react";

type TtsState = { messageId: string | null };
type Listener = () => void;

type Globals = typeof globalThis & {
  __entourageTts?: {
    state: TtsState;
    listeners: Set<Listener>;
  };
};

function getStore() {
  const g = globalThis as Globals;
  if (!g.__entourageTts) {
    g.__entourageTts = {
      state: { messageId: null },
      listeners: new Set(),
    };
  }
  return g.__entourageTts;
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

export function speak(messageId: string, text: string) {
  if (!isTtsSupported()) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  const clearIfActive = () => {
    if (getStore().state.messageId === messageId) setSpeaking(null);
  };
  utterance.onend = clearIfActive;
  utterance.onerror = clearIfActive;
  setSpeaking(messageId);
  window.speechSynthesis.speak(utterance);
}

export function stop() {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
  setSpeaking(null);
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
