import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { getToolUiResourceUri } from "@modelcontextprotocol/ext-apps/app-bridge";
import { loadMcpServers } from "./mcp-store";
import { McpServerConfig } from "./types";

type McpAppTool = {
  serverId: string;
  toolName: string;
  resourceUri: string;
  cachedHtml?: string;
};

type ManagedConnection = {
  client: Client;
  transport: Transport;
  serverId: string;
  tools: McpAppTool[];
};

class McpClientManager {
  private connections = new Map<string, ManagedConnection>();
  private appToolIndex = new Map<string, McpAppTool>();

  async connectAll(): Promise<void> {
    const servers = await loadMcpServers();
    const serverIds = new Set(servers.map((s) => s.id));
    for (const [id] of this.connections) {
      if (!serverIds.has(id)) await this.disconnect(id);
    }
    for (const server of servers) {
      if (!this.connections.has(server.id)) {
        await this.connect(server).catch((err) => {
          console.error(`[MCP] Failed to connect to ${server.name}:`, (err as Error).message);
        });
      }
    }
  }

  async connect(server: McpServerConfig): Promise<void> {
    let transport: Transport;
    if (server.transport === "sse" && server.url) {
      transport = new StreamableHTTPClientTransport(new URL(server.url));
    } else {
      transport = new StdioClientTransport({
        command: server.command!,
        args: server.args ?? [],
        env: { ...process.env, ...(server.env ?? {}) } as Record<string, string>,
      });
    }

    const client = new Client(
      { name: "entourage", version: "0.1.0" },
      {
        capabilities: {
          extensions: {
            "io.modelcontextprotocol/ui": {
              mimeTypes: ["text/html;profile=mcp-app"],
            },
          },
        } as Record<string, unknown>,
      }
    );

    await client.connect(transport);

    // Discover tools with UI resources and pre-cache HTML
    const toolsResult = await client.listTools();
    const appTools: McpAppTool[] = [];
    for (const tool of toolsResult.tools) {
      const uri = getToolUiResourceUri(tool);
      if (uri) {
        const appTool: McpAppTool = {
          serverId: server.id,
          toolName: tool.name,
          resourceUri: uri,
        };
        try {
          const result = await client.readResource({ uri }, { timeout: 120000 });
          const content = result.contents[0];
          if ("text" in content && typeof content.text === "string") {
            appTool.cachedHtml = content.text;
          } else if ("blob" in content && typeof content.blob === "string") {
            appTool.cachedHtml = Buffer.from(content.blob, "base64").toString("utf-8");
          }
        } catch (err) {
          console.warn(`[MCP] Failed to cache HTML for ${tool.name}:`, (err as Error).message);
        }
        appTools.push(appTool);
        this.appToolIndex.set(tool.name, appTool);
      }
    }

    this.connections.set(server.id, { client, transport, serverId: server.id, tools: appTools });
  }

  async disconnect(serverId: string): Promise<void> {
    const conn = this.connections.get(serverId);
    if (!conn) return;
    for (const tool of conn.tools) {
      this.appToolIndex.delete(tool.toolName);
    }
    this.connections.delete(serverId);
    try { await conn.client.close(); } catch { /* ignore */ }
  }

  async disconnectAll(): Promise<void> {
    for (const [id] of this.connections) {
      await this.disconnect(id);
    }
  }

  getAppTool(toolName: string): McpAppTool | undefined {
    const direct = this.appToolIndex.get(toolName);
    if (direct) return direct;
    // Claude CLI prefixes MCP tools as mcp__<server>__<tool>
    // Server names may contain underscores (e.g. "Interactive_Maps"), so split on __ and take last part
    if (toolName.startsWith("mcp__")) {
      const lastSep = toolName.lastIndexOf("__");
      if (lastSep > 4) {
        return this.appToolIndex.get(toolName.slice(lastSep + 2));
      }
    }
    return undefined;
  }

  getAllAppTools(): McpAppTool[] {
    return Array.from(this.appToolIndex.values());
  }

  async readResource(serverId: string, uri: string): Promise<string> {
    const conn = this.connections.get(serverId);
    if (!conn) throw new Error(`MCP server ${serverId} not connected`);
    const result = await conn.client.readResource({ uri }, { timeout: 60000 });
    const content = result.contents[0];
    if ("text" in content && typeof content.text === "string") return content.text;
    if ("blob" in content && typeof content.blob === "string") {
      return Buffer.from(content.blob, "base64").toString("utf-8");
    }
    throw new Error("No HTML content in resource");
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const conn = this.connections.get(serverId);
    if (!conn) throw new Error(`MCP server ${serverId} not connected`);
    return conn.client.callTool({ name: toolName, arguments: args });
  }

  getConnectionStatus(): Array<{ serverId: string; connected: boolean; toolCount: number }> {
    return Array.from(this.connections.values()).map((c) => ({
      serverId: c.serverId,
      connected: true,
      toolCount: c.tools.length,
    }));
  }
}

// Singleton that survives HMR
const key = "__mcpClientManager";
function getMcpClientManager(): McpClientManager {
  const g = globalThis as unknown as Record<string, McpClientManager>;
  if (!g[key]) g[key] = new McpClientManager();
  return g[key];
}

export { getMcpClientManager };
export type { McpAppTool };
