"use client";

import { useState, useRef, useCallback } from "react";
import { Paperclip, X } from "lucide-react";
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

  const uploadImages = async (images: PendingImage[]): Promise<MessageImage[]> => {
    const formData = new FormData();
    for (const img of images) {
      formData.append("files", img.file);
    }
    const res = await fetch(`/api/uploads${wsParam}`, { method: "POST", body: formData });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  };

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
  }, [canSend, content, pendingImages, onSendMessage]);

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
        setShowMentions(false);
      }
    },
    [handleSend]
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

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={`Message ${agents.map((a) => a.name).join(", ")}... (@ to mention)`}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
          style={{ maxHeight: "120px" }}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
          }}
        />

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
    </div>
  );
}
