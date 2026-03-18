"use client";

type DiffLine = {
  type: "add" | "remove" | "context" | "hunk";
  content: string;
  oldLine?: number;
  newLine?: number;
};

function parseDiff(raw: string): DiffLine[] {
  if (!raw) return [];
  const lines = raw.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
      continue;
    }

    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: "hunk", content: line });
      continue;
    }

    if (line.startsWith("+")) {
      result.push({ type: "add", content: line.slice(1), newLine });
      newLine++;
    } else if (line.startsWith("-")) {
      result.push({ type: "remove", content: line.slice(1), oldLine });
      oldLine++;
    } else if (line.startsWith(" ") || line === "") {
      result.push({ type: "context", content: line.startsWith(" ") ? line.slice(1) : line, oldLine, newLine });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

export default function GitDiffViewer({
  diff,
  fileName,
  fileStatus,
}: {
  diff: string | null;
  fileName: string | null;
  fileStatus: string | null;
}) {
  if (!fileName) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-500">
        Select a file to view changes
      </div>
    );
  }

  if (diff !== null && diff.includes("Binary file")) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-500">
        Binary file — diff not available
      </div>
    );
  }

  const lines = parseDiff(diff ?? "");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2.5">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{fileName}</span>
        {fileStatus && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{fileStatus}</span>
        )}
      </div>

      <div className="flex-1 overflow-auto font-mono text-xs leading-5">
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-500">
            No changes
          </div>
        ) : (
          lines.map((line, i) => {
            if (line.type === "hunk") {
              return (
                <div
                  key={i}
                  className="border-y border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-1 text-zinc-500 dark:text-zinc-400 italic"
                >
                  {line.content}
                </div>
              );
            }

            const bgColor =
              line.type === "add"
                ? "bg-green-50 dark:bg-green-900/20"
                : line.type === "remove"
                ? "bg-red-50 dark:bg-red-900/20"
                : "";

            const textColor =
              line.type === "add"
                ? "text-green-700 dark:text-green-400"
                : line.type === "remove"
                ? "text-red-700 dark:text-red-400"
                : "text-zinc-700 dark:text-zinc-300";

            const lineNum =
              line.type === "add"
                ? line.newLine
                : line.type === "remove"
                ? line.oldLine
                : line.oldLine;

            return (
              <div key={i} className={`flex ${bgColor}`}>
                <span className="w-12 flex-shrink-0 select-none pr-2 text-right text-zinc-400 dark:text-zinc-600">
                  {lineNum}
                </span>
                <span className="w-4 flex-shrink-0 select-none text-center text-zinc-400 dark:text-zinc-600">
                  {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                </span>
                <span className={`flex-1 whitespace-pre-wrap break-all pr-4 ${textColor}`}>
                  {line.content}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
