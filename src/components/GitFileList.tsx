"use client";

import { GitFileEntry } from "@/lib/types";

function statusBadge(status: GitFileEntry["status"], staged: boolean) {
  const label = status === "untracked" ? "?" : status[0].toUpperCase();
  const color = staged
    ? status === "deleted" ? "text-red-500" : "text-green-500"
    : status === "deleted" ? "text-red-500" : status === "untracked" ? "text-zinc-400" : "text-yellow-500";
  return (
    <span className={`w-4 text-center text-xs font-semibold ${color}`}>{label}</span>
  );
}

export default function GitFileList({
  staged,
  unstaged,
  selectedFile,
  onSelectFile,
  onStage,
  onUnstage,
  commitMessage,
  onCommitMessageChange,
  onCommit,
  committing,
}: {
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  selectedFile: string | null;
  onSelectFile: (path: string, isStaged: boolean) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  commitMessage: string;
  onCommitMessageChange: (msg: string) => void;
  onCommit: () => void;
  committing: boolean;
}) {
  const canCommit = staged.length > 0 && commitMessage.trim().length > 0 && !committing;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {/* Staged */}
        {staged.length > 0 && (
          <div className="px-3 pt-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Staged Changes ({staged.length})
            </div>
            {staged.map((file) => (
              <div
                key={`staged-${file.path}`}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 ${
                  selectedFile === file.path
                    ? "bg-violet-50 dark:bg-violet-900/20"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                }`}
                onClick={() => onSelectFile(file.path, true)}
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() => onUnstage(file.path)}
                  onClick={(e) => e.stopPropagation()}
                  className="accent-violet-600"
                />
                {statusBadge(file.status, true)}
                <span className="flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">
                  {file.path}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Unstaged */}
        {unstaged.length > 0 && (
          <div className="px-3 pt-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Changes ({unstaged.length})
            </div>
            {unstaged.map((file) => (
              <div
                key={`unstaged-${file.path}`}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 ${
                  selectedFile === file.path
                    ? "bg-violet-50 dark:bg-violet-900/20"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                }`}
                onClick={() => onSelectFile(file.path, false)}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => onStage(file.path)}
                  onClick={(e) => e.stopPropagation()}
                  className="accent-violet-600"
                />
                {statusBadge(file.status, false)}
                <span className="flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">
                  {file.path}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {staged.length === 0 && unstaged.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500 py-12">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-sm">Working tree clean</span>
          </div>
        )}
      </div>

      {/* Commit area */}
      <div className="border-t border-zinc-200 dark:border-zinc-700 p-3">
        <textarea
          value={commitMessage}
          onChange={(e) => onCommitMessageChange(e.target.value)}
          placeholder="Commit message..."
          rows={3}
          className="w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button
          onClick={onCommit}
          disabled={!canCommit}
          className="mt-2 w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {committing ? "Committing..." : `Commit${staged.length > 0 ? ` (${staged.length} file${staged.length > 1 ? "s" : ""})` : ""}`}
        </button>
      </div>
    </div>
  );
}
