"use client";

import { File } from "lucide-react";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilePreview({
  content,
  fileName,
  language,
  size,
  loading,
  error,
}: {
  content: string | null;
  fileName: string | null;
  language: string | null;
  size: number | null;
  loading: boolean;
  error: string | null;
}) {
  if (!fileName) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-500">
        Select a file to preview
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-500">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2.5">
          <File className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{fileName}</span>
        </div>
        <div className="flex flex-1 items-center justify-center text-zinc-400 dark:text-zinc-500">
          {error}
        </div>
      </div>
    );
  }

  const lines = (content ?? "").split("\n");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <File className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{fileName}</span>
          {language && (
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {language}
            </span>
          )}
        </div>
        {size !== null && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatSize(size)}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto font-mono text-xs leading-5">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-12 flex-shrink-0 select-none pr-3 text-right text-zinc-400 dark:text-zinc-600">
              {i + 1}
            </span>
            <span className="flex-1 whitespace-pre pr-4 text-zinc-700 dark:text-zinc-300">
              {line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
