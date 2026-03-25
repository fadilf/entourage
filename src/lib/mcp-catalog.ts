export type McpCatalogCategory = "visualization" | "documents" | "monitoring" | "3d" | "music";

export type McpCatalogEntry = {
  /** Stable slug used to match against installed servers */
  slug: string;
  name: string;
  description: string;
  category: McpCatalogCategory;
  /** lucide icon name for display */
  icon: string;
  /** Pre-filled config for one-click install (matches CreateMcpServerInput shape) */
  config: {
    transport: "stdio";
    command: string;
    args: string[];
  } | {
    transport: "sse";
    url: string;
  };
};

export const MCP_CATEGORIES: { key: McpCatalogCategory; label: string }[] = [
  { key: "visualization", label: "Visualization" },
  { key: "documents", label: "Documents" },
  { key: "monitoring", label: "Monitoring" },
  { key: "3d", label: "3D" },
  { key: "music", label: "Music" },
];

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    slug: "antv-chart",
    name: "AntV Charts",
    description: "26+ chart types — bar, line, scatter, pie, sankey, treemap, flowchart, and more",
    category: "visualization",
    icon: "BarChart3",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@antv/mcp-server-chart"],
    },
  },
  {
    slug: "ext-apps-map",
    name: "Interactive Maps",
    description: "Render interactive maps with markers and regions",
    category: "visualization",
    icon: "Map",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-map", "--stdio"],
    },
  },
  {
    slug: "ext-apps-threejs",
    name: "3D Viewer",
    description: "Interactive 3D visualization with Three.js",
    category: "3d",
    icon: "Box",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-threejs", "--stdio"],
    },
  },
  {
    slug: "ext-apps-pdf",
    name: "PDF Viewer",
    description: "View and navigate PDF documents inline",
    category: "documents",
    icon: "FileText",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-pdf", "--stdio"],
    },
  },
  {
    slug: "ext-apps-system-monitor",
    name: "System Monitor",
    description: "Real-time system resource dashboards",
    category: "monitoring",
    icon: "Activity",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-system-monitor", "--stdio"],
    },
  },
  {
    slug: "ext-apps-sheet-music",
    name: "Sheet Music",
    description: "Render and display music notation",
    category: "music",
    icon: "Music",
    config: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sheet-music", "--stdio"],
    },
  },
];

/**
 * Check if a catalog entry is already installed AND connected.
 * Matches command+args (stdio) or url (sse) against configured servers,
 * and requires the server to be connected to show "Installed."
 */
export function isCatalogEntryInstalled(
  entry: McpCatalogEntry,
  installedServers: { transport: string; command?: string; args?: string[]; url?: string; connected?: boolean }[],
): boolean {
  return installedServers.some((server) => {
    if (!server.connected) return false;
    if (entry.config.transport === "stdio" && server.transport === "stdio") {
      return (
        server.command === entry.config.command &&
        JSON.stringify(server.args) === JSON.stringify(entry.config.args)
      );
    }
    if (entry.config.transport === "sse" && server.transport === "sse") {
      return server.url === entry.config.url;
    }
    return false;
  });
}

/**
 * Check if a catalog entry has been added to config (regardless of connection status).
 * Used to distinguish "not installed" from "added but disconnected."
 */
export function isCatalogEntryAdded(
  entry: McpCatalogEntry,
  installedServers: { transport: string; command?: string; args?: string[]; url?: string }[],
): boolean {
  return installedServers.some((server) => {
    if (entry.config.transport === "stdio" && server.transport === "stdio") {
      return (
        server.command === entry.config.command &&
        JSON.stringify(server.args) === JSON.stringify(entry.config.args)
      );
    }
    if (entry.config.transport === "sse" && server.transport === "sse") {
      return server.url === entry.config.url;
    }
    return false;
  });
}

/**
 * Filter catalog entries by category. Returns all if category is undefined.
 */
export function filterCatalog(
  catalog: McpCatalogEntry[],
  category?: McpCatalogCategory,
): McpCatalogEntry[] {
  if (!category) return catalog;
  return catalog.filter((entry) => entry.category === category);
}
