"use client";

import { useState, useEffect, useCallback } from "react";
import { GitBranch, ArrowDown, ArrowUp } from "lucide-react";
import { GitStatus } from "@/lib/types";
import Dialog from "./Dialog";
import GitFileList from "./GitFileList";
import GitDiffViewer from "./GitDiffViewer";

export default function GitDialog({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
}) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [, setSelectedStaged] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsParam = workspaceId ? `?workspaceId=${workspaceId}` : "";

  const fetchStatus = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await fetch(`/api/git/status${wsParam}`);
      if (!res.ok) throw new Error("Failed to fetch status");
      const data: GitStatus = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, [workspaceId, wsParam]);

  useEffect(() => {
    if (open) {
      fetchStatus();
      setSelectedFile(null);
      setDiff(null);
      setCommitMessage("");
    }
  }, [open, fetchStatus]);

  const fetchDiff = useCallback(
    async (filePath: string, staged: boolean) => {
      if (!workspaceId) return;
      try {
        const res = await fetch(
          `/api/git/diff${wsParam}&file=${encodeURIComponent(filePath)}&staged=${staged}`
        );
        if (!res.ok) throw new Error("Failed to fetch diff");
        const data = await res.json();
        setDiff(data.diff);
      } catch {
        setDiff(null);
      }
    },
    [workspaceId, wsParam]
  );

  const handleSelectFile = (path: string, isStaged: boolean) => {
    setSelectedFile(path);
    setSelectedStaged(isStaged);
    fetchDiff(path, isStaged);
  };

  const handleStage = async (path: string) => {
    await fetch(`/api/git/stage${wsParam}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: [path], action: "stage" }),
    });
    await fetchStatus();
    if (selectedFile === path) {
      setSelectedStaged(true);
      fetchDiff(path, true);
    }
  };

  const handleUnstage = async (path: string) => {
    await fetch(`/api/git/stage${wsParam}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: [path], action: "unstage" }),
    });
    await fetchStatus();
    if (selectedFile === path) {
      setSelectedStaged(false);
      fetchDiff(path, false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    try {
      const res = await fetch(`/api/git/commit${wsParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMessage.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Commit failed");
        return;
      }
      setCommitMessage("");
      setSelectedFile(null);
      setDiff(null);
      await fetchStatus();
    } finally {
      setCommitting(false);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    setError(null);
    try {
      const res = await fetch(`/api/git/pull${wsParam}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Pull failed");
        return;
      }
      await fetchStatus();
    } catch {
      setError("Pull failed");
    } finally {
      setPulling(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    setError(null);
    try {
      const res = await fetch(`/api/git/push${wsParam}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Push failed");
        return;
      }
      await fetchStatus();
    } catch {
      setError("Push failed");
    } finally {
      setPushing(false);
    }
  };

  const totalChanges = (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0);
  const selectedFileStatus = selectedFile
    ? [...(status?.staged ?? []), ...(status?.unstaged ?? [])].find((f) => f.path === selectedFile)?.status ?? null
    : null;

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="flex w-full max-w-4xl flex-col rounded-xl bg-white dark:bg-zinc-800 shadow-xl mx-4" style={{ height: "70vh", maxHeight: 600 }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <GitBranch className="h-4 w-4 text-violet-500" />
            <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Source Control</span>
            {status?.branch && (
              <span className="rounded-full bg-violet-100 dark:bg-violet-900/40 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                {status.branch}
              </span>
            )}
            {status?.isRepo && (
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={handlePull}
                  disabled={pulling || (status?.behind === 0)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={`Pull${status?.behind ? ` (${status.behind} behind)` : ""}`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  {pulling ? "..." : status?.behind ? status.behind : ""}
                </button>
                <button
                  onClick={handlePush}
                  disabled={pushing || (status?.ahead === 0)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={`Push${status?.ahead ? ` (${status.ahead} ahead)` : ""}`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  {pushing ? "..." : status?.ahead ? status.ahead : ""}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {totalChanges > 0 && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {totalChanges} change{totalChanges !== 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 text-xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        {/* Body */}
        {status && !status.isRepo ? (
          <div className="flex flex-1 items-center justify-center text-zinc-400 dark:text-zinc-500">
            Not a git repository
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            <div className="w-72 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-700">
              <GitFileList
                staged={status?.staged ?? []}
                unstaged={status?.unstaged ?? []}
                selectedFile={selectedFile}
                onSelectFile={handleSelectFile}
                onStage={handleStage}
                onUnstage={handleUnstage}
                commitMessage={commitMessage}
                onCommitMessageChange={setCommitMessage}
                onCommit={handleCommit}
                committing={committing}
              />
            </div>
            <div className="flex-1 min-w-0">
              <GitDiffViewer
                diff={diff}
                fileName={selectedFile}
                fileStatus={selectedFileStatus}
              />
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
