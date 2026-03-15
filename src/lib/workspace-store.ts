import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Workspace } from "./types";

const WORKSPACE_FILE = path.join(os.homedir(), ".nexus", "workspaces.json");

type WorkspaceData = { workspaces: Workspace[] };

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

async function loadData(): Promise<WorkspaceData> {
  try {
    const raw = await readFile(WORKSPACE_FILE, "utf-8");
    return JSON.parse(raw) as WorkspaceData;
  } catch {
    const data: WorkspaceData = { workspaces: [] };
    await saveData(data);
    return data;
  }
}

async function saveData(data: WorkspaceData): Promise<void> {
  await mkdir(path.dirname(WORKSPACE_FILE), { recursive: true });
  await writeFile(WORKSPACE_FILE, JSON.stringify(data, null, 2));
}

export async function loadWorkspaces(): Promise<Workspace[]> {
  const data = await loadData();
  return data.workspaces;
}

export async function addWorkspace(directory: string, name?: string, color?: string): Promise<Workspace> {
  const data = await loadData();

  if (data.workspaces.some((w) => w.directory === directory)) {
    throw new Error("Workspace for this directory already exists");
  }

  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name: name || path.basename(directory),
    directory,
    color: color || COLORS[data.workspaces.length % COLORS.length],
    addedAt: new Date().toISOString(),
  };

  data.workspaces.push(workspace);
  await saveData(data);
  return workspace;
}

export async function removeWorkspace(id: string): Promise<void> {
  const data = await loadData();
  data.workspaces = data.workspaces.filter((w) => w.id !== id);
  await saveData(data);
}

export async function updateWorkspace(id: string, updates: Partial<Pick<Workspace, "name" | "color">>): Promise<Workspace> {
  const data = await loadData();
  const idx = data.workspaces.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error("Workspace not found");

  data.workspaces[idx] = { ...data.workspaces[idx], ...updates };
  await saveData(data);
  return data.workspaces[idx];
}

export async function getWorkspaceDir(id: string): Promise<string> {
  const data = await loadData();
  const ws = data.workspaces.find((w) => w.id === id);
  if (!ws) throw new Error("Workspace not found");
  return ws.directory;
}
