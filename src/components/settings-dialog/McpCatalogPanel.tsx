"use client";

import { useState } from "react";
import {
  Download,
  Check,
  BarChart3,
  Map,
  Box,
  FileText,
  Activity,
  Music,
  type LucideIcon,
} from "lucide-react";
import {
  MCP_CATALOG,
  MCP_CATEGORIES,
  isCatalogEntryInstalled,
  isCatalogEntryAdded,
  filterCatalog,
  type McpCatalogCategory,
  type McpCatalogEntry,
} from "@/lib/mcp-catalog";
import type { McpServer, CreateMcpServerInput } from "./types";

const CATALOG_ICONS: Record<string, LucideIcon> = {
  BarChart3,
  Map,
  Box,
  FileText,
  Activity,
  Music,
};

type McpCatalogPanelProps = {
  mcpServers: McpServer[];
  onInstall: (server: CreateMcpServerInput) => Promise<void>;
};

function CatalogIcon({ name }: { name: string }) {
  const Icon = CATALOG_ICONS[name];
  if (!Icon) return null;
  return <Icon className="h-5 w-5" />;
}

function CatalogCard({
  entry,
  installed,
  added,
  onInstall,
}: {
  entry: McpCatalogEntry;
  installed: boolean;
  added: boolean;
  onInstall: () => Promise<void>;
}) {
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await onInstall();
    } finally {
      setInstalling(false);
    }
  };

  const renderStatus = () => {
    if (installed) {
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Check className="h-3 w-3" />
          Installed
        </span>
      );
    }
    if (added) {
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          Connecting...
        </span>
      );
    }
    return (
      <button
        onClick={handleInstall}
        disabled={installing}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <Download className="h-3 w-3" />
        {installing ? "Installing..." : "Install"}
      </button>
    );
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
        <CatalogIcon name={entry.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {entry.name}
          </span>
          {renderStatus()}
        </div>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {entry.description}
        </p>
      </div>
    </div>
  );
}

export default function McpCatalogPanel({ mcpServers, onInstall }: McpCatalogPanelProps) {
  const [activeCategory, setActiveCategory] = useState<McpCatalogCategory | undefined>();

  const filtered = filterCatalog(MCP_CATALOG, activeCategory);

  const handleInstall = (entry: McpCatalogEntry) => async () => {
    const input: CreateMcpServerInput =
      entry.config.transport === "stdio"
        ? {
            name: entry.name,
            transport: "stdio",
            command: entry.config.command,
            args: entry.config.args,
          }
        : {
            name: entry.name,
            transport: "sse",
            url: entry.config.url,
          };
    await onInstall(input);
  };

  return (
    <div className="space-y-3">
      {/* Category filter pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory(undefined)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            !activeCategory
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
          }`}
        >
          All
        </button>
        {MCP_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              activeCategory === cat.key
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Catalog grid */}
      <div className="space-y-2">
        {filtered.map((entry) => (
          <CatalogCard
            key={entry.slug}
            entry={entry}
            installed={isCatalogEntryInstalled(entry, mcpServers)}
            added={isCatalogEntryAdded(entry, mcpServers)}
            onInstall={handleInstall(entry)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-4 text-center text-xs text-zinc-400">
          No servers in this category
        </p>
      )}
    </div>
  );
}
