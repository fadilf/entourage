"use client";

import Image from "next/image";
import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, Image as ImageIcon, MessageSquare, ChevronLeft, Check, X, Mic, Square } from "lucide-react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { Agent, MessageImage, ThreadListItem } from "@/lib/types";
import ModelIcon from "./ModelIcon";
import { useWorkspaceId, useWsParam } from "@/contexts/WorkspaceContext";

type PendingImage = {
  file: File;
  preview: string;
};

type StoredImage = {
  name: string;
  type: string;
  dataUrl: string;
};

function getDraftStorageKey(workspaceId: string | null, threadId: string): string {
  return `entourage-message-draft:${workspaceId ?? "default"}:${threadId}`;
}

function getImageDraftStorageKey(workspaceId: string | null, threadId: string): string {
  return `entourage-image-draft:${workspaceId ?? "default"}:${threadId}`;
}

function readDraft(storageKey: string): string {
  if (typeof window === "undefined") return "";

  try {
    return localStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(storageKey: string, value: string): void {
  if (typeof window === "undefined") return;

  try {
    if (value) {
      localStorage.setItem(storageKey, value);
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore localStorage errors and keep the in-memory draft working.
  }
}

function readImageDraft(storageKey: string): PendingImage[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const stored: StoredImage[] = JSON.parse(raw);
    return stored.map((img) => {
      const byteString = atob(img.dataUrl.split(",")[1]);
      const mimeString = img.dataUrl.split(",")[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const file = new File([ab], img.name, { type: mimeString });
      return { file, preview: URL.createObjectURL(file) };
    });
  } catch {
    return [];
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function writeImageDraft(storageKey: string, images: PendingImage[]): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if (images.length === 0) {
      localStorage.removeItem(storageKey);
      return;
    }
    const stored: StoredImage[] = await Promise.all(
      images.map(async (img) => ({
        name: img.file.name,
        type: img.file.type,
        dataUrl: await fileToDataUrl(img.file),
      }))
    );
    localStorage.setItem(storageKey, JSON.stringify(stored));
  } catch {
    // Ignore localStorage errors (e.g. quota exceeded for large images).
  }
}

function getThreadDraftStorageKey(workspaceId: string | null, threadId: string): string {
  return `entourage-thread-draft:${workspaceId ?? "default"}:${threadId}`;
}

function readThreadDraft(storageKey: string): { id: string; title: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeThreadDraft(storageKey: string, threads: { id: string; title: string }[]): void {
  if (typeof window === "undefined") return;
  try {
    if (threads.length === 0) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(threads));
    }
  } catch {
    // Ignore localStorage errors
  }
}

export default function MessageInput({
  threadId,
  agents,
  allAgents,
  onSendMessage,
  onStop,
  disabled,
  isMobile,
  onDraftChange,
  showTopBorder = true,
  compactTopPadding = false,
  workspaceThreads,
  editDraft,
  onEditDraftConsumed,
}: {
  threadId: string;
  agents: Agent[];
  allAgents?: Agent[];
  onSendMessage: (content: string, images?: MessageImage[], attachedThreads?: { id: string; title: string }[]) => void;
  onStop?: (agentId: string) => void;
  disabled?: boolean;
  isMobile?: boolean;
  onDraftChange?: (hasText: boolean) => void;
  showTopBorder?: boolean;
  compactTopPadding?: boolean;
  workspaceThreads?: ThreadListItem[];
  editDraft?: string | null;
  onEditDraftConsumed?: () => void;
}) {
  const workspaceId = useWorkspaceId();
  const wsParam = useWsParam();
  const draftStorageKey = getDraftStorageKey(workspaceId, threadId);
  const imageDraftStorageKey = getImageDraftStorageKey(workspaceId, threadId);
  const [content, setContent] = useState(() => readDraft(draftStorageKey));
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>(() => readImageDraft(imageDraftStorageKey));
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const threadDraftStorageKey = getThreadDraftStorageKey(workspaceId, threadId);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showThreadPicker, setShowThreadPicker] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [pendingThreads, setPendingThreads] = useState<{ id: string; title: string }[]>(
    () => readThreadDraft(getThreadDraftStorageKey(workspaceId, threadId))
  );
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const MAX_ATTACHED_THREADS = 5;

  const updateDraft = useCallback(
    (value: string) => {
      setContent(value);
      writeDraft(draftStorageKey, value);
    },
    [draftStorageKey]
  );

  const { isListening, interimText, isSupported, permissionDenied, toggle, stopListening: stopVoice } = useVoiceInput(
    useCallback((text: string) => {
      setContent((prev) => {
        const next = prev + text;
        writeDraft(draftStorageKey, next);
        return next;
      });
    }, [draftStorageKey])
  );

  const autocompleteAgents = allAgents ?? agents;
  const threadAgentIds = new Set(agents.map((a) => a.id));
  const filteredAgents = autocompleteAgents.filter((a) =>
    a.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const canSend = (content.trim() || pendingImages.length > 0) && !disabled && !uploading;

  useEffect(() => {
    onDraftChange?.(content.trim().length > 0);
  }, [content, onDraftChange]);

  // When an edit draft is provided, load it into the input and focus
  useEffect(() => {
    if (editDraft == null) return;
    updateDraft(editDraft);
    onEditDraftConsumed?.();
    // Focus and move cursor to end
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = ta.value.length;
      }
    });
  }, [editDraft, onEditDraftConsumed, updateDraft]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }, [content]);

  useEffect(() => {
    if (!showPlusMenu && !showThreadPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        plusButtonRef.current && !plusButtonRef.current.contains(e.target as Node)
      ) {
        setShowPlusMenu(false);
        setShowThreadPicker(false);
        setThreadSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPlusMenu, showThreadPicker]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const newImages = imageFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPendingImages((prev) => {
      const next = [...prev, ...newImages];
      writeImageDraft(imageDraftStorageKey, next);
      return next;
    });
  }, [imageDraftStorageKey]);

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].preview);
      next.splice(index, 1);
      writeImageDraft(imageDraftStorageKey, next);
      return next;
    });
  }, [imageDraftStorageKey]);

  const uploadImages = useCallback(async (images: PendingImage[]): Promise<MessageImage[]> => {
    const formData = new FormData();
    for (const img of images) {
      formData.append("files", img.file);
    }
    const res = await fetch(`/api/uploads${wsParam}`, { method: "POST", body: formData });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  }, [wsParam]);

  const toggleThread = useCallback((thread: { id: string; title: string }) => {
    setPendingThreads((prev) => {
      const exists = prev.some((t) => t.id === thread.id);
      const next = exists
        ? prev.filter((t) => t.id !== thread.id)
        : prev.length >= MAX_ATTACHED_THREADS
          ? prev
          : [...prev, { id: thread.id, title: thread.title }];
      writeThreadDraft(threadDraftStorageKey, next);
      return next;
    });
  }, [threadDraftStorageKey]);

  const removeThread = useCallback((threadId: string) => {
    setPendingThreads((prev) => {
      const next = prev.filter((t) => t.id !== threadId);
      writeThreadDraft(threadDraftStorageKey, next);
      return next;
    });
  }, [threadDraftStorageKey]);

  const handleSend = useCallback(async () => {
    if (!canSend) return;

    let images: MessageImage[] | undefined;

    if (pendingImages.length > 0) {
      setUploading(true);
      try {
        images = await uploadImages(pendingImages);
      } catch {
        setUploading(false);
        return;
      }
      pendingImages.forEach((img) => URL.revokeObjectURL(img.preview));
      setPendingImages([]);
      writeImageDraft(imageDraftStorageKey, []);
      setUploading(false);
    }

    const attachedThreads = pendingThreads.length > 0
      ? pendingThreads
      : undefined;

    onSendMessage(content.trim(), images, attachedThreads);
    updateDraft("");
    setShowMentions(false);

    // Clear pending threads
    if (pendingThreads.length > 0) {
      setPendingThreads([]);
      writeThreadDraft(threadDraftStorageKey, []);
    }
  }, [canSend, content, pendingImages, pendingThreads, onSendMessage, uploadImages, updateDraft, imageDraftStorageKey, threadDraftStorageKey]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      updateDraft(value);

      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPos);
      const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
      if (mentionMatch) {
        setShowMentions(true);
        setMentionFilter(mentionMatch[1]);
      } else {
        setShowMentions(false);
      }
    },
    [updateDraft]
  );

  const insertMention = useCallback(
    (agent: Agent) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = content.slice(0, cursorPos);
      const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
      if (mentionMatch) {
        const start = cursorPos - mentionMatch[0].length;
        const newContent =
          content.slice(0, start) + `@${agent.name.toLowerCase()} ` + content.slice(cursorPos);
        updateDraft(newContent);
      }
      setShowMentions(false);
      textarea.focus();
    },
    [content, updateDraft]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") {
        if (isListening) {
          stopVoice();
        } else {
          setShowMentions(false);
        }
      }
    },
    [handleSend, isListening, stopVoice]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData.files;
      if (files.length > 0) {
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (imageFiles.length > 0) {
          e.preventDefault();
          addFiles(imageFiles);
        }
      }
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  return (
    <div
      className={`relative ${
        showTopBorder
          ? "border-t border-zinc-200 dark:border-zinc-700 py-4"
          : compactTopPadding
            ? "pt-2 pb-4"
            : "py-3"
      } ${isMobile ? "px-4" : "px-6"} ${isDragOver ? "bg-violet-50 dark:bg-violet-900/20" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-violet-400 bg-violet-50/80 dark:bg-violet-900/40">
          <span className="text-sm font-medium text-violet-600 dark:text-violet-400">Drop images here</span>
        </div>
      )}

      {showMentions && filteredAgents.length > 0 && (
        <div className={`absolute bottom-full ${isMobile ? "left-4 right-4" : "left-6"} mb-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 shadow-lg`}>
          {filteredAgents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => insertMention(agent)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full"
                style={{
                  border: `1.5px solid ${agent.avatarColor}`,
                  boxShadow: `inset 0 1px 4px ${agent.avatarColor}80`,
                }}
              >
                <ModelIcon model={agent.model} icon={agent.icon} className="h-3 w-3" />
              </span>
              {agent.name}
              {!threadAgentIds.has(agent.id) && (
                <span className="ml-auto pl-3 text-xs text-zinc-400 dark:text-zinc-500">+ add to thread</span>
              )}
            </button>
          ))}
        </div>
      )}

      {pendingImages.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingImages.map((img, i) => (
            <div key={i} className="group relative">
              <Image
                src={img.preview}
                alt={img.file.name}
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 rounded-lg border border-zinc-200 dark:border-zinc-700 object-cover"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingThreads.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pendingThreads.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-md bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400"
            >
              <MessageSquare className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{t.title}</span>
              <button
                onClick={() => removeThread(t.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-violet-200 dark:hover:bg-violet-800"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="relative">
          <button
            ref={plusButtonRef}
            onClick={() => {
              if (showThreadPicker) {
                setShowThreadPicker(false);
                setShowPlusMenu(false);
                setThreadSearchQuery("");
              } else {
                setShowPlusMenu((v) => !v);
              }
            }}
            disabled={disabled}
            className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300 disabled:opacity-50"
            title="Attach"
          >
            <Plus className="h-5 w-5" />
          </button>

          {(showPlusMenu || showThreadPicker) && (
            <div
              ref={popoverRef}
              className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg overflow-hidden z-50"
            >
              {showThreadPicker ? (
                <>
                  <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 px-3 py-2">
                    <button
                      onClick={() => {
                        setShowThreadPicker(false);
                        setShowPlusMenu(true);
                        setThreadSearchQuery("");
                      }}
                      className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Attach threads</span>
                  </div>
                  <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-700">
                    <input
                      type="text"
                      placeholder="Search threads..."
                      value={threadSearchQuery}
                      onChange={(e) => setThreadSearchQuery(e.target.value)}
                      className="w-full rounded-md border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700 px-2 py-1 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-violet-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {(workspaceThreads ?? [])
                      .filter((t) => t.id !== threadId)
                      .filter((t) => !t.archived)
                      .filter((t) => !threadSearchQuery || t.title.toLowerCase().includes(threadSearchQuery.toLowerCase()))
                      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                      .map((t) => {
                        const isSelected = pendingThreads.some((pt) => pt.id === t.id);
                        const isDisabled = !isSelected && pendingThreads.length >= MAX_ATTACHED_THREADS;
                        return (
                          <button
                            key={t.id}
                            onClick={() => !isDisabled && toggleThread({ id: t.id, title: t.title })}
                            disabled={isDisabled}
                            className={`flex w-full items-start gap-2 px-3 py-2 text-sm transition-colors ${
                              isDisabled
                                ? "opacity-40 cursor-not-allowed"
                                : "hover:bg-zinc-100 dark:hover:bg-zinc-700"
                            } ${isSelected ? "bg-violet-50 dark:bg-violet-900/20" : ""}`}
                          >
                            <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              isSelected
                                ? "border-violet-500 bg-violet-500 text-white"
                                : "border-zinc-300 dark:border-zinc-600"
                            }`}>
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>
                            <div className="min-w-0 flex-1 text-left">
                              <span className="block truncate text-zinc-700 dark:text-zinc-300">{t.title}</span>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                  {new Date(t.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                </span>
                                <div className="flex -space-x-1 shrink-0">
                                  {t.agents.slice(0, 3).map((a) => (
                                    <div
                                      key={a.id}
                                      className="h-3.5 w-3.5 rounded-full border border-white dark:border-zinc-800"
                                      style={{ backgroundColor: a.avatarColor }}
                                      title={a.name}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                  <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2">
                    <button
                      onClick={() => {
                        setShowThreadPicker(false);
                        setShowPlusMenu(false);
                        setThreadSearchQuery("");
                      }}
                      className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                    >
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-1">
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowPlusMenu(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    <ImageIcon className="h-4 w-4" />
                    Attach images
                  </button>
                  <button
                    onClick={() => {
                      setShowPlusMenu(false);
                      setShowThreadPicker(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Attach thread
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative flex-1 flex items-end">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={`Message ${agents.map((a) => a.name).join(", ")}... (@ to mention)`}
            disabled={disabled}
            rows={1}
            className={`w-full resize-none rounded-lg border bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none disabled:opacity-50 ${
              isListening
                ? "border-violet-500 ring-1 ring-violet-500"
                : "border-zinc-200 dark:border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            }`}
            style={{
              maxHeight: "120px",
              paddingRight: isSupported ? "2.5rem" : undefined,
              ...(isListening ? { boxShadow: "0 0 12px rgba(124, 58, 237, 0.3)" } : {}),
            }}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
          />
          {isSupported && (
            <button
              type="button"
              onClick={toggle}
              disabled={disabled}
              className={`absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                permissionDenied
                  ? "bg-red-500 text-white"
                  : isListening
                    ? "animate-pulse bg-red-500 text-white"
                    : "bg-zinc-100 dark:bg-zinc-700 text-zinc-400 hover:border-violet-500 hover:text-violet-500 border border-transparent"
              } disabled:opacity-50`}
              title={isListening ? "Stop voice input" : "Start voice input"}
            >
              {isListening ? (
                <Square className="h-3 w-3" />
              ) : (
                <Mic className="h-3 w-3" />
              )}
            </button>
          )}
        </div>

        {disabled && onStop ? (
          <button
            onClick={() => agents.forEach((a) => onStop(a.id))}
            className="shrink-0 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="shrink-0 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Send"}
          </button>
        )}
      </div>
      {isListening && interimText && (
        <div className="mt-1.5 flex items-center gap-1.5 px-1">
          <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="truncate text-xs text-zinc-400 italic">
            {interimText}
          </span>
        </div>
      )}
    </div>
  );
}
