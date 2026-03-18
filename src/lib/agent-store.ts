import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { DEFAULT_AGENTS, DEFAULT_AGENT_IDS } from "./config";
import { Agent } from "./types";

type Config = { agents: Agent[]; displayName?: string };

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".entourage");
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "config.json");

// Write lock to serialize file writes
let writeLock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = writeLock;
  const next = prev.then(fn, fn);
  writeLock = next.then(() => {}, () => {});
  return next;
}

let migrated = false;

async function migrateIfNeeded(): Promise<void> {
  if (migrated) return;
  try {
    await readFile(GLOBAL_CONFIG_PATH, "utf-8");
    migrated = true;
    return;
  } catch {
    // Global config doesn't exist yet — try to migrate from first workspace
  }

  try {
    const wsRaw = await readFile(path.join(GLOBAL_CONFIG_DIR, "workspaces.json"), "utf-8");
    const wsData = JSON.parse(wsRaw) as { workspaces: { directory: string }[] };
    for (const ws of wsData.workspaces) {
      try {
        const localConfig = await readFile(path.join(ws.directory, ".entourage", "config.json"), "utf-8");
        JSON.parse(localConfig);
        await mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
        await writeFile(GLOBAL_CONFIG_PATH, localConfig);
        migrated = true;
        return;
      } catch {
        continue;
      }
    }
  } catch {
    // No workspaces.json or can't read it
  }
}

async function loadConfig(): Promise<Config> {
  await migrateIfNeeded();
  try {
    const raw = await readFile(GLOBAL_CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as Config;

    // Merge in any new default agents that were added since config was created
    const existingIds = new Set(config.agents.map((a) => a.id));
    const missing = DEFAULT_AGENTS.filter((a) => !existingIds.has(a.id));
    if (missing.length > 0) {
      config.agents.push(...missing.map((a) => ({ ...a, isDefault: true })));
      await saveConfig(config);
    }

    return config;
  } catch {
    const agents = DEFAULT_AGENTS.map((a) => ({ ...a, isDefault: true }));
    const config: Config = { agents };
    await saveConfig(config);
    return config;
  }
}

async function saveConfig(config: Config): Promise<void> {
  return withLock(async () => {
    await mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
    await writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2));
  });
}

export async function loadAgents(): Promise<Agent[]> {
  const config = await loadConfig();
  return config.agents;
}

export async function saveAgents(agents: Agent[]): Promise<void> {
  const config = await loadConfig();
  await saveConfig({ ...config, agents });
}

export function getDefaultDisplayName(): string {
  try {
    return os.userInfo().username;
  } catch {
    return "You";
  }
}

export async function loadDisplayName(): Promise<string> {
  const config = await loadConfig();
  return config.displayName || getDefaultDisplayName();
}

export async function saveDisplayName(displayName: string): Promise<void> {
  const config = await loadConfig();
  await saveConfig({ ...config, displayName: displayName || undefined });
}

function validateAgentName(name: string): void {
  if (!/^[a-zA-Z0-9]+$/.test(name)) {
    throw new Error("Agent name must contain only letters and numbers (no spaces or special characters)");
  }
}

export async function createAgent(data: {
  name: string;
  model: Agent["model"];
  avatarColor: string;
  icon?: Agent["icon"];
  personality?: string;
}): Promise<Agent> {
  validateAgentName(data.name);
  const agents = await loadAgents();

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
  await saveAgents(agents);
  return agent;
}

export async function updateAgent(id: string, updates: Partial<Omit<Agent, "id" | "isDefault">>): Promise<Agent> {
  const agents = await loadAgents();
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
  await saveAgents(agents);
  return agents[idx];
}

export async function deleteAgent(id: string): Promise<void> {
  if (DEFAULT_AGENT_IDS.includes(id)) {
    throw new Error("Cannot delete default agents");
  }

  const agents = await loadAgents();
  const filtered = agents.filter((a) => a.id !== id);
  if (filtered.length === agents.length) {
    throw new Error("Agent not found");
  }
  await saveAgents(filtered);
}

export async function reorderAgents(orderedIds: string[]): Promise<Agent[]> {
  const agents = await loadAgents();
  const map = new Map(agents.map((a) => [a.id, a]));
  const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as Agent[];
  // Append any agents not in the ordered list (shouldn't happen, but safe)
  for (const a of agents) {
    if (!orderedIds.includes(a.id)) reordered.push(a);
  }
  await saveAgents(reordered);
  return reordered;
}

export async function getAgent(id: string): Promise<Agent | null> {
  const agents = await loadAgents();
  return agents.find((a) => a.id === id) ?? null;
}
