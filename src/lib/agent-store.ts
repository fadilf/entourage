import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { NEXUS_DIR, DEFAULT_AGENTS, DEFAULT_AGENT_IDS } from "./config";
import { Agent } from "./types";

function getWorkingDirectory(): string {
  return process.env.NEXUS_PROJECT_DIR || process.cwd();
}

function getConfigPath(): string {
  return path.join(getWorkingDirectory(), NEXUS_DIR, "config.json");
}

// Write lock to serialize file writes
let writeLock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = writeLock;
  const next = prev.then(fn, fn);
  writeLock = next.then(() => {}, () => {});
  return next;
}

export async function loadAgents(): Promise<Agent[]> {
  try {
    const raw = await readFile(getConfigPath(), "utf-8");
    const config = JSON.parse(raw) as { agents: Agent[] };
    return config.agents;
  } catch {
    // Seed from defaults
    const agents = DEFAULT_AGENTS.map((a) => ({ ...a, isDefault: true }));
    await saveAgents(agents);
    return agents;
  }
}

export async function saveAgents(agents: Agent[]): Promise<void> {
  return withLock(async () => {
    const dir = path.join(getWorkingDirectory(), NEXUS_DIR);
    await mkdir(dir, { recursive: true });
    await writeFile(getConfigPath(), JSON.stringify({ agents }, null, 2));
  });
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

export async function getAgent(id: string): Promise<Agent | null> {
  const agents = await loadAgents();
  return agents.find((a) => a.id === id) ?? null;
}
