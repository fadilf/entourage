"use client";

import { useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import type { CreateMcpServerInput, McpServer } from "./types";

type McpServersPanelProps = {
  mcpServers: McpServer[];
  onAddServer: (server: CreateMcpServerInput) => Promise<void>;
  onDeleteServer: (serverId: string) => Promise<void>;
};

const EMPTY_MCP_FORM = {
  name: "",
  url: "",
  command: "",
  args: "",
};

export default function McpServersPanel({
  mcpServers,
  onAddServer,
  onDeleteServer,
}: McpServersPanelProps) {
  const [form, setForm] = useState(EMPTY_MCP_FORM);
  const [adding, setAdding] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const handleAdd = async () => {
    const hasUrl = form.url.trim();
    const hasCommand = form.command.trim();

    if (!form.name.trim() || (!hasUrl && !hasCommand)) {
      return;
    }

    setAdding(true);

    try {
      await onAddServer(
        hasUrl
          ? {
              name: form.name.trim(),
              transport: "sse",
              url: form.url.trim(),
            }
          : {
              name: form.name.trim(),
              transport: "stdio",
              command: form.command.trim(),
              args: form.args.trim().split(/\s+/).filter(Boolean),
            },
      );
      setForm(EMPTY_MCP_FORM);
      setAdvanced(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          MCP Servers{" "}
          <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
            beta
          </span>
        </h4>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Connect to MCP servers that provide interactive app UIs for their tools.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
          placeholder="Name"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
        />
        <input
          type="text"
          value={form.url}
          onChange={(e) => setForm((current) => ({ ...current, url: e.target.value }))}
          placeholder="Remote MCP server URL"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
        />

        <button
          type="button"
          onClick={() => setAdvanced((current) => !current)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${advanced ? "rotate-90" : ""}`} />
          Advanced settings
        </button>

        {advanced && (
          <div className="space-y-2 border-l-2 border-zinc-200 pl-4 dark:border-zinc-700">
            <p className="text-[10px] text-zinc-400">
              For local stdio servers (instead of remote URL)
            </p>
            <input
              type="text"
              value={form.command}
              onChange={(e) => setForm((current) => ({ ...current, command: e.target.value }))}
              placeholder="Command (e.g. npx)"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
            />
            <input
              type="text"
              value={form.args}
              onChange={(e) => setForm((current) => ({ ...current, args: e.target.value }))}
              placeholder="Arguments (e.g. -y @modelcontextprotocol/server-map --stdio)"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
            />
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={adding || !form.name.trim() || (!form.url.trim() && !form.command.trim())}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {adding ? "Connecting..." : "Add"}
        </button>
      </div>

      {mcpServers.map((server) => (
        <div
          key={server.id}
          className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700"
        >
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${server.connected ? "bg-emerald-500" : "bg-red-400"}`} />
            <div>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{server.name}</span>
              <p className="text-xs text-zinc-400">
                {server.url || `${server.command} ${server.args?.join(" ")}`}
                {server.connected && ` · ${server.appToolCount} app tool${server.appToolCount !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => onDeleteServer(server.id)}
            className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {mcpServers.length === 0 && (
        <p className="py-4 text-center text-xs text-zinc-400">No MCP servers configured</p>
      )}
    </div>
  );
}
