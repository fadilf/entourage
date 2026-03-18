"use client";

export default function QuickReplies({
  suggestions,
  loading,
  onSelect,
}: {
  suggestions: string[];
  loading: boolean;
  onSelect: (text: string) => void;
}) {
  if (!loading && suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      {loading
        ? Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-8 rounded-full bg-zinc-100 dark:bg-zinc-700 animate-pulse"
              style={{ width: `${80 + i * 30}px` }}
            />
          ))
        : suggestions.map((text, i) => (
            <button
              key={`${i}-${text}`}
              onClick={() => onSelect(text)}
              className="rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              {text}
            </button>
          ))}
    </div>
  );
}
