"use client";

import { useState, useRef, useCallback } from "react";
import { Paperclip, X, Mic, Square } from "lucide-react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { Agent, MessageImage } from "@/lib/types";
import { useWsParam } from "@/contexts/WorkspaceContext";

type PendingImage = {
  file: File;
  preview: string;
};

export default function MessageInput({
  agents,
  allAgents,
  onSendMessage,
  onStop,
  disabled,
  isMobile,
}: {
  agents: Agent[];
  allAgents?: Agent[];
  onSendMessage: (content: string, images?: MessageImage[]) => void;
  onStop?: (agentId: string) => void;
  disabled?: boolean;
  isMobile?: boolean;
}) {
  const wsParam = useWsParam();
  const [content, setContent] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isListening, interimText, isSupported, permissionDenied, toggle, stopListening: stopVoice } = useVoiceInput(
    useCallback((text: string) => {
      setContent((prev) => prev + text);
    }, [])
  );

  const autocompleteAgents = allAgents ?? agents;
  const threadAgentIds = new Set(agents.map((a) => a.id));
  const filteredAgents = autocompleteAgents.filter((a) =>
    a.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const canSend = (content.trim() || pendingImages.length > 0) && !disabled && !uploading;

  const addFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const newImages = imageFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPendingImages((prev) => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].preview);
      next.splice(index, 1);
      return next;
    });
  }, []);

  const uploadImages = useCallback(async (images: PendingImage[]): Promise<MessageImage[]> => {
    const formData = new FormData();
    for (const img of images) {
      formData.append("files", img.file);
    }
    const res = await fetch(`/api/uploads${wsParam}`, { method: "POST", body: formData });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  }, [wsParam]);

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
      // Clean up previews
      pendingImages.forEach((img) => URL.revokeObjectURL(img.preview));
      setPendingImages([]);
      setUploading(false);
    }

    onSendMessage(content.trim(), images);
    setContent("");
    setShowMentions(false);
  }, [canSend, content, pendingImages, onSendMessage, uploadImages]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setContent(value);

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
    []
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
        setContent(newContent);
      }
      setShowMentions(false);
      textarea.focus();
    },
    [content]
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
      className={`relative border-t border-zinc-200 ${isMobile ? "px-4" : "px-6"} py-4 ${isDragOver ? "bg-violet-50" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-violet-400 bg-violet-50/80">
          <span className="text-sm font-medium text-violet-600">Drop images here</span>
        </div>
      )}

      {showMentions && filteredAgents.length > 0 && (
        <div className={`absolute bottom-full ${isMobile ? "left-4 right-4" : "left-6"} mb-1 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg`}>
          {filteredAgents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => insertMention(agent)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full"
                style={{
                  border: `1.5px solid ${agent.avatarColor}`,
                  boxShadow: `inset 0 1px 4px ${agent.avatarColor}80`,
                }}
              >
                <img
                  src={`/agent-icons/${agent.model === "claude" ? "Claude_AI_symbol" : "Google_Gemini_icon_2025"}.svg`}
                  alt={agent.model}
                  className="h-3 w-3"
                />
              </span>
              {agent.name}
              {!threadAgentIds.has(agent.id) && (
                <span className="ml-auto pl-3 text-xs text-zinc-400">+ add to thread</span>
              )}
            </button>
          ))}
        </div>
      )}

      {pendingImages.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingImages.map((img, i) => (
            <div key={i} className="group relative">
              <img
                src={img.preview}
                alt={img.file.name}
                className="h-16 w-16 rounded-lg border border-zinc-200 object-cover"
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
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
          title="Attach images"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={`Message ${agents.map((a) => a.name).join(", ")}... (@ to mention)`}
            disabled={disabled}
            rows={1}
            className={`w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:opacity-50 ${
              isListening
                ? "border-violet-500 ring-1 ring-violet-500"
                : "border-zinc-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
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
                    : "bg-zinc-100 text-zinc-400 hover:border-violet-500 hover:text-violet-500 border border-transparent"
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
            className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
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
