"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Check, X } from "lucide-react";
import { ToolCall } from "@/lib/types";

function truncateOutput(text: string, maxLines = 8): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}

function formatInput(input: string): string {
  try {
    const parsed = JSON.parse(input);
    // Show key parameters concisely
    if (typeof parsed === "object" && parsed !== null) {
      const entries = Object.entries(parsed);
      if (entries.length === 0) return "";
      // For common tool patterns, show the most relevant field
      if (parsed.file_path) return parsed.file_path;
      if (parsed.command) return parsed.command;
      if (parsed.pattern) return parsed.pattern;
      if (parsed.query) return parsed.query;
      if (parsed.url) return parsed.url;
      // Fallback: show first entry
      const [key, val] = entries[0];
      const valStr = typeof val === "string" ? val : JSON.stringify(val);
      return entries.length === 1 ? valStr : `${key}: ${valStr}`;
    }
    return input;
  } catch {
    return input;
  }
}

function StatusIcon({ status }: { status: ToolCall["status"] }) {
  if (status === "running") {
    return <Loader2 className="h-3 w-3 animate-spin text-amber-500" />;
  }
  if (status === "complete") {
    return <Check className="h-3 w-3 text-emerald-500" />;
  }
  return <X className="h-3 w-3 text-red-500" />;
}

export default function ToolCallBlock({ toolCall, grouped }: { toolCall: ToolCall; grouped?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const inputSummary = toolCall.input ? formatInput(toolCall.input) : "";

  return (
    <div className={grouped ? "text-xs bg-zinc-100/60 dark:bg-zinc-800/60" : "my-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-xs"}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors ${grouped ? "" : "rounded-md"}`}
      >
        <StatusIcon status={toolCall.status} />
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{toolCall.name}</span>
        {inputSummary && (
          <span className="truncate text-zinc-500 dark:text-zinc-400">{inputSummary}</span>
        )}
        <ChevronDown
          className={`ml-auto h-3 w-3 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-2.5 py-2 space-y-2">
          {toolCall.input && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Input</div>
              <pre className="overflow-x-auto rounded bg-zinc-900 px-2 py-1.5 text-zinc-100 text-[11px] leading-relaxed font-mono whitespace-pre-wrap">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(toolCall.input!), null, 2);
                  } catch {
                    return toolCall.input;
                  }
                })()}
              </pre>
            </div>
          )}
          {toolCall.output && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Output</div>
              <ToolOutput output={toolCall.output} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolOutput({ output }: { output: string }) {
  const [showFull, setShowFull] = useState(false);
  const { text, truncated } = truncateOutput(output);

  return (
    <>
      <pre className="overflow-x-auto rounded bg-zinc-900 px-2 py-1.5 text-zinc-100 text-[11px] leading-relaxed font-mono whitespace-pre-wrap">
        {showFull ? output : text}
        {truncated && !showFull && (
          <span className="text-zinc-500">...</span>
        )}
      </pre>
      {truncated && (
        <button
          onClick={() => setShowFull(!showFull)}
          className="mt-1 text-[10px] text-violet-500 hover:text-violet-400"
        >
          {showFull ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}
