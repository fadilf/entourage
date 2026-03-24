"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Check, X } from "lucide-react";
import { ToolCall } from "@/lib/types";
import ToolCallBlock from "./ToolCallBlock";

function toolPreview(toolCalls: ToolCall[]): string {
  const counts = new Map<string, number>();
  for (const tc of toolCalls) {
    counts.set(tc.name, (counts.get(tc.name) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [name, count] of counts) {
    parts.push(count > 1 ? `${name} x${count}` : name);
  }
  return parts.join(", ");
}

export default function ToolCallGroup({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false);

  const runningCount = toolCalls.filter((tc) => tc.status === "running").length;
  const errorCount = toolCalls.filter((tc) => tc.status === "error").length;

  const summaryIcon =
    runningCount > 0 ? (
      <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
    ) : errorCount > 0 ? (
      <X className="h-3 w-3 text-red-500" />
    ) : (
      <Check className="h-3 w-3 text-emerald-500" />
    );

  const label =
    runningCount > 0
      ? `${toolCalls.length} tool calls (${runningCount} running...)`
      : `${toolCalls.length} tool calls`;

  const preview = toolPreview(toolCalls);

  return (
    <div className="my-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700/50 rounded-md transition-colors"
      >
        {summaryIcon}
        <span className="font-medium text-zinc-700 dark:text-zinc-300 shrink-0">{label}</span>
        {!expanded && preview && (
          <span className="truncate text-zinc-400 dark:text-zinc-500">{preview}</span>
        )}
        <ChevronDown
          className={`ml-auto h-3 w-3 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="mx-2 mb-1.5 mt-0.5 rounded border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-200 dark:divide-zinc-700 overflow-hidden">
          {toolCalls.map((tc) => (
            <ToolCallBlock key={tc.id} toolCall={tc} grouped />
          ))}
        </div>
      )}
    </div>
  );
}
