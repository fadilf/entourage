import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { ENTOURAGE_DIR, DEFAULT_AGENTS, DEFAULT_AGENT_IDS } from "./config";
import { Agent } from "./types";

type Config = { agents: Agent[]; displayName?: string };

function getConfigPath(workspaceDir: string): string {
  return path.join(workspaceDir, ENTOURAGE_DIR, "config.json");
}

// Write lock to serialize file writes
let writeLock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = writeLock;
  const next = prev.then(fn, fn);
  writeLock = next.then(() => {}, () => {});
  return next;
}

async function loadConfig(workspaceDir: string): Promise<Config> {
  try {
    const raw = await readFile(getConfigPath(workspaceDir), "utf-8");
    return JSON.parse(raw) as Config;
  } catch {
    const agents = DEFAULT_AGENTS.map((a) => ({ ...a, isDefault: true }));
    const config: Config = { agents };
    await saveConfig(workspaceDir, config);
    return config;
  }
}

async function saveConfig(workspaceDir: string, config: Config): Promise<void> {
  return withLock(async () => {
    const dir = path.join(workspaceDir, ENTOURAGE_DIR);
    await mkdir(dir, { recursive: true });
    await writeFile(getConfigPath(workspaceDir), JSON.stringify(config, null, 2));
  });
}

export async function loadAgents(workspaceDir: string): Promise<Agent[]> {
  const config = await loadConfig(workspaceDir);
  return config.agents;
}

export async function saveAgents(workspaceDir: string, agents: Agent[]): Promise<void> {
  const config = await loadConfig(workspaceDir);
  await saveConfig(workspaceDir, { ...config, agents });
}

export function getDefaultDisplayName(): string {
  try {
    return os.userInfo().username;
  } catch {
    return "You";
  }
}

export async function loadDisplayName(workspaceDir: string): Promise<string> {
  const config = await loadConfig(workspaceDir);
  return config.displayName || getDefaultDisplayName();
}

export async function saveDisplayName(workspaceDir: string, displayName: string): Promise<void> {
  const config = await loadConfig(workspaceDir);
  await saveConfig(workspaceDir, { ...config, displayName: displayName || undefined });
}

function validateAgentName(name: string): void {
  if (!/^[a-zA-Z0-9]+$/.test(name)) {
    throw new Error("Agent name must contain only letters and numbers (no spaces or special characters)");
  }
}

export async function createAgent(workspaceDir: string, data: {
  name: string;
  model: Agent["model"];
  avatarColor: string;
  icon?: Agent["icon"];
  personality?: string;
}): Promise<Agent> {
  validateAgentName(data.name);
  const agents = await loadAgents(workspaceDir);

  if (agents.some((a) => a.name.toLowerCase() === data.name.toLowerCase())) {
    throw new Error(`Agent name "${data.name}" is already taken`);
  }

  const agent: Agent = {
    id: crypto.randomUUID(),
    name: data.name,
    model: data.model,
    avatarColor: data.avatarColor,
    icon: data.icon,
    personality: data.personality,
    isDefault: false,
  };

  agents.push(agent);
  await saveAgents(workspaceDir, agents);
  return agent;
}

export async function updateAgent(workspaceDir: string, id: string, updates: Partial<Omit<Agent, "id" | "isDefault">>): Promise<Agent> {
  const agents = await loadAgents(workspaceDir);
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error("Agent not found");

  if (updates.name) {
    validateAgentName(updates.name);
    if (updates.name !== agents[idx].name) {
      if (agents.some((a) => a.id !== id && a.name.toLowerCase() === updates.name!.toLowerCase())) {
        throw new Error(`Agent name "${updates.name}" is already taken`);
      }
    }
  }

  agents[idx] = { ...agents[idx], ...updates };
  await saveAgents(workspaceDir, agents);
  return agents[idx];
}

export async function deleteAgent(workspaceDir: string, id: string): Promise<void> {
  if (DEFAULT_AGENT_IDS.includes(id)) {
    throw new Error("Cannot delete default agents");
  }

  const agents = await loadAgents(workspaceDir);
  const filtered = agents.filter((a) => a.id !== id);
  if (filtered.length === agents.length) {
    throw new Error("Agent not found");
  }
  await saveAgents(workspaceDir, filtered);
}

export async function getAgent(workspaceDir: string, id: string): Promise<Agent | null> {
  const agents = await loadAgents(workspaceDir);
  return agents.find((a) => a.id === id) ?? null;
}
