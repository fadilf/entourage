"use client";

import { useState, useRef, useCallback } from "react";
import { Agent } from "@/lib/types";

export default function MessageInput({
  agents,
  onSendMessage,
  onStop,
  disabled,
}: {
  agents: Agent[];
  onSendMessage: (content: string) => void;
  onStop?: (agentId: string) => void;
  disabled?: boolean;
}) {
  const [content, setContent] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredAgents = agents.filter((a) =>
    a.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setContent(value);

      // Check for @mention trigger
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
        if (content.trim() && !disabled) {
          onSendMessage(content.trim());
          setContent("");
          setShowMentions(false);
        }
      }
      if (e.key === "Escape") {
        setShowMentions(false);
      }
    },
    [content, disabled, onSendMessage]
  );

  return (
    <div className="relative border-t border-zinc-200 px-6 py-4">
      {showMentions && filteredAgents.length > 0 && (
        <div className="absolute bottom-full left-6 mb-1 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
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
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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
            onClick={() => {
              if (content.trim()) {
                onSendMessage(content.trim());
                setContent("");
              }
            }}
            disabled={!content.trim() || disabled}
            className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
