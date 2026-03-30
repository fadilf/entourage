"use client";

import { useState, useEffect, useCallback } from "react";
import { Agent, AgentModel, Icon, PermissionLevel } from "@/lib/types";
import Dialog from "./Dialog";
import { useTheme } from "next-themes";
import { useWorkspaceId } from "@/contexts/WorkspaceContext";
import AgentFormPanel from "./settings-dialog/AgentFormPanel";
import AgentProfilesPanel from "./settings-dialog/AgentProfilesPanel";
import GeneralSettingsPanel from "./settings-dialog/GeneralSettingsPanel";
import McpServersPanel from "./settings-dialog/McpServersPanel";
import PluginsPanel from "./settings-dialog/PluginsPanel";
import SettingsDialogHeader from "./settings-dialog/SettingsDialogHeader";
import {
  EMPTY_AGENT_FORM,
  type AgentFormData,
  type CreateMcpServerInput,
  type McpServer,
  type Tab,
} from "./settings-dialog/types";

const EMPTY_DEFAULT_CLI_MODELS: Record<AgentModel, string> = {
  claude: "",
  gemini: "",
  codex: "",
};

function normalizeDefaultCliModels(
  value?: Partial<Record<AgentModel, string>>
): Record<AgentModel, string> {
  return {
    claude: value?.claude ?? "",
    gemini: value?.gemini ?? "",
    codex: value?.codex ?? "",
  };
}

export default function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<AgentFormData>(EMPTY_AGENT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [displayName, setDisplayName] = useState("");
  const [savedDisplayName, setSavedDisplayName] = useState("");
  const [userIcon, setUserIcon] = useState<Icon | undefined>(undefined);
  const [savedUserIcon, setSavedUserIcon] = useState<Icon | undefined>(undefined);
  const [userColor, setUserColor] = useState("#7c3aed");
  const [savedUserColor, setSavedUserColor] = useState("#7c3aed");
  const [defaultCliModels, setDefaultCliModels] = useState<Record<AgentModel, string>>(EMPTY_DEFAULT_CLI_MODELS);
  const [savedDefaultCliModels, setSavedDefaultCliModels] = useState<Record<AgentModel, string>>(EMPTY_DEFAULT_CLI_MODELS);
  const [plugins, setPlugins] = useState<Record<string, boolean>>({});
  const [quickRepliesEnabled, setQuickRepliesEnabled] = useState(false);
  const [toolCallGroupingEnabled, setToolCallGroupingEnabled] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const workspaceId = useWorkspaceId();
  const [wsPermissionLevel, setWsPermissionLevel] = useState<PermissionLevel>("full");

  const patchConfig = useCallback(async (body: Record<string, unknown>) => {
    return fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }, []);

  const fetchAgents = useCallback(async () => {
    const res = await fetch(`/api/agents`);
    if (res.ok) setAgents(await res.json());
  }, []);

  const fetchMcpServers = useCallback(async () => {
    const res = await fetch("/api/mcp-servers");
    if (res.ok) setMcpServers(await res.json());
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await fetch(`/api/config`);
    if (res.ok) {
      const data = await res.json();
      setDisplayName(data.displayName || "");
      setSavedDisplayName(data.displayName || "");
      const nextDefaultCliModels = normalizeDefaultCliModels(data.defaultCliModels);
      setDefaultCliModels(nextDefaultCliModels);
      setSavedDefaultCliModels(nextDefaultCliModels);
      setPlugins(data.plugins || {});
      if (data.quickReplies) {
        setQuickRepliesEnabled(data.quickReplies.enabled);
      }
      if (data.toolCallGrouping) {
        setToolCallGroupingEnabled(data.toolCallGrouping.enabled);
      }
      if (data.userIcon !== undefined) {
        setUserIcon(data.userIcon);
        setSavedUserIcon(data.userIcon);
      } else {
        setUserIcon(undefined);
        setSavedUserIcon(undefined);
      }
      setUserColor(data.userColor || "#7c3aed");
      setSavedUserColor(data.userColor || "#7c3aed");
    }
  }, []);

  const fetchWorkspacePermission = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch("/api/workspaces");
    if (res.ok) {
      const workspaces = await res.json();
      const ws = workspaces.find((w: { id: string }) => w.id === workspaceId);
      if (ws) setWsPermissionLevel(ws.permissionLevel ?? "full");
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      fetchAgents();
      fetchConfig();
      fetchMcpServers();
      fetchWorkspacePermission();
    }
  }, [open, fetchAgents, fetchConfig, fetchMcpServers, fetchWorkspacePermission]);

  const handleSaveDisplayName = async () => {
    const res = await patchConfig({ displayName });
    if (res.ok) {
      const data = await res.json();
      setSavedDisplayName(data.displayName);
      setDisplayName(data.displayName);
    }
  };

  const handleSaveUserProfile = async () => {
    const res = await patchConfig({
      userIcon: userIcon ?? null,
      userColor,
    });
    if (res.ok) {
      const data = await res.json();
      setSavedUserIcon(data.userIcon);
      setUserIcon(data.userIcon);
      setSavedUserColor(data.userColor || "#7c3aed");
      setUserColor(data.userColor || "#7c3aed");
    }
  };

  const handleSaveDefaultCliModels = async () => {
    const res = await patchConfig({ defaultCliModels });
    if (res.ok) {
      const data = await res.json();
      const nextDefaultCliModels = normalizeDefaultCliModels(data.defaultCliModels);
      setSavedDefaultCliModels(nextDefaultCliModels);
      setDefaultCliModels(nextDefaultCliModels);
    }
  };

  const showForm = editingAgent !== null || isCreating;

  const startCreate = () => {
    setForm({ ...EMPTY_AGENT_FORM });
    setEditingAgent(null);
    setIsCreating(true);
    setError("");
  };

  const startEdit = (agent: Agent) => {
    setForm({
      name: agent.name,
      model: agent.model,
      cliModel: agent.cliModel ?? "",
      avatarColor: agent.avatarColor,
      icon: agent.icon,
      personality: agent.personality,
    });
    setEditingAgent(agent);
    setIsCreating(false);
    setError("");
  };

  const cancelForm = () => {
    setEditingAgent(null);
    setIsCreating(false);
    setError("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(form.name.trim())) {
      setError("Name must contain only letters and numbers (no spaces or special characters)");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const body = {
        name: form.name.trim(),
        model: form.model,
        cliModel: form.cliModel.trim() || undefined,
        avatarColor: form.avatarColor,
        icon: form.icon,
        personality: form.personality?.trim() || undefined,
      };

      let res: Response;
      if (editingAgent) {
        res = await fetch(`/api/agents/${editingAgent.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/agents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }

      await fetchAgents();
      cancelForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agent: Agent) => {
    const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchAgents();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to delete");
    }
  };

  const handleFormUpdate = (patch: Partial<AgentFormData>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);
    setError("");
  };

  const handleToggleQuickReplies = async () => {
    const next = !quickRepliesEnabled;
    setQuickRepliesEnabled(next);
    await patchConfig({ quickRepliesEnabled: next });
  };

  const handleDefaultCliModelChange = (model: AgentModel, value: string) => {
    setDefaultCliModels((current) => ({ ...current, [model]: value }));
  };

  const handleToggleToolCallGrouping = async () => {
    const next = !toolCallGroupingEnabled;
    setToolCallGroupingEnabled(next);
    await patchConfig({ toolCallGroupingEnabled: next });
  };

  const handlePermissionLevelChange = async (value: PermissionLevel) => {
    setWsPermissionLevel(value);
    if (workspaceId) {
      await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionLevel: value }),
      });
    }
  };

  const handleReorderAgents = async (orderedIds: string[]) => {
    setAgents((current) => orderedIds.map((id) => current.find((agent) => agent.id === id)).filter(Boolean) as Agent[]);
    await fetch("/api/agents/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
  };

  const handleTogglePlugin = async (pluginId: string, enabled: boolean) => {
    const updated = { ...plugins, [pluginId]: !enabled };
    setPlugins(updated);
    await patchConfig({ plugins: updated });
  };

  const handleAddMcpServer = async (server: CreateMcpServerInput) => {
    await fetch("/api/mcp-servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(server),
    });
    await fetchMcpServers();
  };

  const handleDeleteMcpServer = async (serverId: string) => {
    await fetch(`/api/mcp-servers/${serverId}`, { method: "DELETE" });
    await fetchMcpServers();
  };

  const renderContent = () => {
    if (showForm) {
      return (
        <AgentFormPanel
          form={form}
          error={error}
          saving={saving}
          editingAgentName={editingAgent?.name}
          onUpdate={handleFormUpdate}
          onCancel={cancelForm}
          onSave={handleSave}
        />
      );
    }

    switch (tab) {
      case "general":
        return (
          <GeneralSettingsPanel
            mounted={mounted}
            resolvedTheme={resolvedTheme}
            displayName={displayName}
            savedDisplayName={savedDisplayName}
            userIcon={userIcon}
            userColor={userColor || "#7c3aed"}
            savedUserIcon={savedUserIcon}
            savedUserColor={savedUserColor || "#7c3aed"}
            onUserIconChange={(icon) => setUserIcon(icon ?? undefined)}
            onUserColorChange={setUserColor}
            onSaveUserProfile={handleSaveUserProfile}
            defaultCliModels={defaultCliModels}
            savedDefaultCliModels={savedDefaultCliModels}
            quickRepliesEnabled={quickRepliesEnabled}
            toolCallGroupingEnabled={toolCallGroupingEnabled}
            wsPermissionLevel={wsPermissionLevel}
            onToggleTheme={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            onDisplayNameChange={setDisplayName}
            onSaveDisplayName={handleSaveDisplayName}
            onDefaultCliModelChange={handleDefaultCliModelChange}
            onSaveDefaultCliModels={handleSaveDefaultCliModels}
            onToggleQuickReplies={handleToggleQuickReplies}
            onToggleToolCallGrouping={handleToggleToolCallGrouping}
            onPermissionLevelChange={handlePermissionLevelChange}
          />
        );
      case "agents":
        return (
          <AgentProfilesPanel
            agents={agents}
            error={error}
            onStartCreate={startCreate}
            onStartEdit={startEdit}
            onDelete={handleDelete}
            onReorder={handleReorderAgents}
          />
        );
      case "plugins":
        return (
          <PluginsPanel
            plugins={plugins}
            onTogglePlugin={handleTogglePlugin}
          />
        );
      case "mcp":
        return (
          <McpServersPanel
            mcpServers={mcpServers}
            onAddServer={handleAddMcpServer}
            onDeleteServer={handleDeleteMcpServer}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-white dark:bg-zinc-800 shadow-xl mx-4" style={{ maxHeight: "85vh" }}>
        <SettingsDialogHeader
          showForm={showForm}
          editingAgentName={editingAgent?.name}
          tab={tab}
          onTabChange={handleTabChange}
          onBack={cancelForm}
          onClose={onClose}
        />
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {renderContent()}
        </div>
      </div>
    </Dialog>
  );
}
