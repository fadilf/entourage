import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { McpServerConfig } from "./types";

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".entourage");
const MCP_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "mcp-servers.json");

let writeLock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = writeLock;
  const next = prev.then(fn, fn);
  writeLock = next.then(
    () => {},
    () => {}
  );
  return next;
}

export async function loadMcpServers(): Promise<McpServerConfig[]> {
  try {
    const raw = await readFile(MCP_CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as McpServerConfig[];
  } catch {
    return [];
  }
}

async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  return withLock(async () => {
    await mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
    await writeFile(MCP_CONFIG_PATH, JSON.stringify(servers, null, 2));
  });
}

export async function addMcpServer(
  data: Omit<McpServerConfig, "id">
): Promise<McpServerConfig> {
  const servers = await loadMcpServers();
  const server: McpServerConfig = { id: crypto.randomUUID(), ...data };
  servers.push(server);
  await saveMcpServers(servers);
  return server;
}

export async function removeMcpServer(id: string): Promise<void> {
  const servers = await loadMcpServers();
  await saveMcpServers(servers.filter((s) => s.id !== id));
}
