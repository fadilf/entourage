"use client";

import { useState, useEffect, useCallback } from "react";
import { FolderOpen, ChevronRight } from "lucide-react";
import Dialog from "./Dialog";
import FileTree from "./FileTree";
import FilePreview from "./FilePreview";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const PDF_EXTS = new Set(["pdf"]);

function getExt(filePath: string): string {
  return filePath.split(".").pop()?.toLowerCase() ?? "";
}

export default function FileBrowserDialog({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLanguage, setFileLanguage] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"text" | "image" | "pdf">("text");
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [treeKey, setTreeKey] = useState(0);

  // Reset state when dialog opens (matches GitDialog pattern)
  useEffect(() => {
    if (open) {
      setSelectedPath(null);
      setFileContent(null);
      setFileLanguage(null);
      setFileSize(null);
      setFileError(null);
      setPreviewMode("text");
      setRawUrl(null);
      setTreeKey((k) => k + 1);
    }
  }, [open]);


  const handleSelectFile = useCallback(
    async (filePath: string) => {
      if (!workspaceId) return;
      setSelectedPath(filePath);
      setFileError(null);
      setFileContent(null);
      setRawUrl(null);

      const ext = getExt(filePath);
      const params = new URLSearchParams({ workspaceId, path: filePath });

      if (IMAGE_EXTS.has(ext)) {
        setPreviewMode("image");
        setRawUrl(`/api/files/raw?${params}`);
        setFileLoading(false);
        return;
      }

      if (PDF_EXTS.has(ext)) {
        setPreviewMode("pdf");
        setRawUrl(`/api/files/raw?${params}`);
        setFileLoading(false);
        return;
      }

      setPreviewMode("text");
      setFileLoading(true);
      try {
        const res = await fetch(`/api/files/read?${params}`);
        const data = await res.json();
        if (!res.ok) {
          setFileError(data.error || "Failed to read file");
          return;
        }
        setFileContent(data.content);
        setFileLanguage(data.language);
        setFileSize(data.size);
      } catch {
        setFileError("Failed to read file");
      } finally {
        setFileLoading(false);
      }
    },
    [workspaceId]
  );

  const pathSegments = selectedPath?.split("/") ?? [];

  return (
    <Dialog open={open} onClose={onClose}>
      <div
        className="flex w-full max-w-4xl flex-col rounded-xl bg-white dark:bg-zinc-800 shadow-xl mx-4"
        style={{ height: "70vh", maxHeight: 600 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-5 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FolderOpen className="h-4 w-4 text-violet-500 shrink-0" />
            <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100 shrink-0">
              File Browser
            </span>
            {selectedPath && (
              <div className="flex items-center gap-0.5 text-sm text-zinc-500 dark:text-zinc-400 min-w-0 overflow-hidden">
                <ChevronRight size={14} className="shrink-0 text-zinc-400" />
                {pathSegments.map((seg, i) => (
                  <span key={i} className="flex items-center gap-0.5 shrink-0">
                    {i > 0 && <ChevronRight size={12} className="text-zinc-400" />}
                    <span className={i === pathSegments.length - 1 ? "text-zinc-700 dark:text-zinc-200 font-medium" : ""}>
                      {seg}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <div className="w-72 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-700">
            {workspaceId ? (
              <FileTree
                key={treeKey}
                workspaceId={workspaceId}
                selectedPath={selectedPath}
                onSelectFile={handleSelectFile}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                No workspace selected
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <FilePreview
              content={fileContent}
              fileName={selectedPath ? selectedPath.split("/").pop() ?? null : null}
              language={fileLanguage}
              size={fileSize}
              loading={fileLoading}
              error={fileError}
              previewMode={previewMode}
              rawUrl={rawUrl}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
