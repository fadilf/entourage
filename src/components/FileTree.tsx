"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, File } from "lucide-react";

type Entry = {
  name: string;
  type: "directory" | "file";
  path: string;
};

type DirState = {
  entries: Entry[];
  loading: boolean;
  truncated: boolean;
};

export default function FileTree({
  workspaceId,
  selectedPath,
  onSelectFile,
}: {
  workspaceId: string;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState<Map<string, DirState>>(new Map());
  const [rootState, setRootState] = useState<DirState>({ entries: [], loading: true, truncated: false });

  const fetchDir = useCallback(
    async (dirPath: string): Promise<DirState> => {
      const params = new URLSearchParams({ workspaceId });
      if (dirPath) params.set("path", dirPath);
      const res = await fetch(`/api/files/tree?${params}`);
      if (!res.ok) return { entries: [], loading: false, truncated: false };
      const data = await res.json();
      return { entries: data.entries, loading: false, truncated: data.truncated ?? false };
    },
    [workspaceId]
  );

  // Load root directory
  useEffect(() => {
    let cancelled = false;
    fetchDir("").then((result) => {
      if (!cancelled) setRootState(result);
    });
    return () => { cancelled = true; };
  }, [fetchDir]);

  const toggleDir = useCallback(
    (dirPath: string) => {
      setExpanded((prev) => {
        if (prev.has(dirPath)) {
          const next = new Map(prev);
          next.delete(dirPath);
          return next;
        }
        const next = new Map(prev);
        next.set(dirPath, { entries: [], loading: true, truncated: false });
        // Kick off fetch (fire-and-forget, updates state when done)
        fetchDir(dirPath).then((result) => {
          setExpanded((p) => {
            if (!p.has(dirPath)) return p; // collapsed while loading
            const n = new Map(p);
            n.set(dirPath, result);
            return n;
          });
        });
        return next;
      });
    },
    [fetchDir]
  );

  const renderEntries = (entries: Entry[], depth: number) => {
    return entries.map((entry) => {
      const isExpanded = expanded.has(entry.path);
      const dirState = expanded.get(entry.path);
      const isSelected = entry.path === selectedPath;

      return (
        <div key={entry.path}>
          <button
            onClick={() => {
              if (entry.type === "directory") {
                toggleDir(entry.path);
              } else {
                onSelectFile(entry.path);
              }
            }}
            className={`w-full flex items-center gap-1.5 py-1 px-2 text-sm text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
              isSelected ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300" : "text-zinc-700 dark:text-zinc-300"
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {entry.type === "directory" ? (
              <>
                {isExpanded ? (
                  <ChevronDown size={14} className="shrink-0 text-zinc-400" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 text-zinc-400" />
                )}
                {isExpanded ? (
                  <FolderOpen size={15} className="shrink-0 text-violet-500" />
                ) : (
                  <Folder size={15} className="shrink-0 text-violet-500" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5 shrink-0" />
                <File size={15} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
              </>
            )}
            <span className="truncate">{entry.name}</span>
          </button>

          {entry.type === "directory" && isExpanded && dirState && (
            <>
              {dirState.loading ? (
                <div
                  className="py-1 text-xs text-zinc-400 dark:text-zinc-500"
                  style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                >
                  Loading...
                </div>
              ) : dirState.entries.length === 0 ? (
                <div
                  className="py-1 text-xs text-zinc-400 dark:text-zinc-500 italic"
                  style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                >
                  Empty
                </div>
              ) : (
                renderEntries(dirState.entries, depth + 1)
              )}
              {dirState.truncated && (
                <div
                  className="py-1 text-xs text-amber-500"
                  style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                >
                  500+ entries — some hidden
                </div>
              )}
            </>
          )}
        </div>
      );
    });
  };

  return (
    <div className="h-full overflow-y-auto py-1">
      {rootState.loading ? (
        <div className="px-3 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
          Loading...
        </div>
      ) : rootState.entries.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
          Empty directory
        </div>
      ) : (
        <>
          {renderEntries(rootState.entries, 0)}
          {rootState.truncated && (
            <div className="px-3 py-1 text-xs text-amber-500">
              500+ entries — some hidden
            </div>
          )}
        </>
      )}
    </div>
  );
}
