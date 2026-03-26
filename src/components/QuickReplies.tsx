"use client";

import { Pencil } from "lucide-react";

export default function QuickReplies({
  suggestions,
  loading,
  onSelect,
  onEdit,
  className,
}: {
  suggestions: string[];
  loading: boolean;
  onSelect: (text: string) => void;
  onEdit?: (text: string) => void;
  className?: string;
}) {
  if (!loading && suggestions.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className ?? "px-4 pb-2"}`}>
      {loading
        ? Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-8 rounded-full bg-zinc-100 dark:bg-zinc-700 animate-pulse"
              style={{ width: `${80 + i * 30}px` }}
            />
          ))
        : suggestions.map((text, i) => (
            <div
              key={`${i}-${text}`}
              className="flex items-stretch rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden"
            >
              <button
                onClick={() => onSelect(text)}
                className="pl-3 pr-1.5 py-1.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                {text}
              </button>
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(text);
                  }}
                  className="flex items-center justify-center px-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-600 transition-colors"
                  title="Edit suggestion"
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
          ))}
    </div>
  );
}
