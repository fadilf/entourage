"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Agent, AgentModel, Icon, PermissionLevel } from "@/lib/types";
import Dialog from "./Dialog";
import { useTheme } from "next-themes";
import { useWorkspaceId } from "@/contexts/WorkspaceContext";
import AgentFormPanel from "./settings-dialog/AgentFormPanel";
import AgentProfilesPanel from "./settings-dialog/AgentProfilesPanel";
import GeneralSettingsPanel, { type InstallState, type PiperStatus } from "./settings-dialog/GeneralSettingsPanel";
import McpServersPanel from "./settings-dialog/McpServersPanel";
import PluginsPanel from "./settings-dialog/PluginsPanel";
import SettingsDialogHeader from "./settings-dialog/SettingsDialogHeader";
import { refreshTtsConfig, type TtsConfig, type TtsEngine } from "@/lib/tts";
import {
  EMPTY_AGENT_FORM,
  type AgentFormData,
  type CreateMcpServerInput,
  type McpServer,
  type Tab,
} from "./settings-dialog/types";

const DEFAULT_TTS: TtsConfig = { engine: "web" };

type InstallEvent =
  | { stage: "download-binary"; bytesReceived: number; bytesTotal: number }
  | { stage: "verify-binary" }
  | { stage: "extract" }
  | { stage: "download-voice"; voiceId: string; file: "onnx" | "json"; bytesReceived: number; bytesTotal: number }
  | { stage: "verify-voice"; voiceId: string }
  | { stage: "done" }
  | { stage: "error"; message: string };

function installEventToState(event: InstallEvent): InstallState | null {
  switch (event.stage) {
    case "download-binary":
      return { status: "installing", stage: event.stage, label: "Downloading Piper binary…", bytesReceived: event.bytesReceived, bytesTotal: event.bytesTotal };
    case "verify-binary":
      return { status: "installing", stage: event.stage, label: "Verifying binary…" };
    case "extract":
      return { status: "installing", stage: event.stage, label: "Extracting…" };
    case "download-voice":
      return { status: "installing", stage: event.stage, label: `Downloading voice (${event.file})…`, bytesReceived: event.bytesReceived, bytesTotal: event.bytesTotal };
    case "verify-voice":
      return { status: "installing", stage: event.stage, label: "Verifying voice…" };
    case "done":
      return null;
    case "error":
      return { status: "error", message: event.message };
  }
}

const EMPTY_DEFAULT_CLI_MODELS: Record<AgentModel, string> = {
  claude: "",
  codex: "",
};

function normalizeDefaultCliModels(
  value?: Partial<Record<AgentModel, string>>
): Record<AgentModel, string> {
  return {
    claude: value?.claude ?? "",
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
  const [ttsConfig, setTtsConfig] = useState<TtsConfig>(DEFAULT_TTS);
  const [piperStatus, setPiperStatus] = useState<PiperStatus | null>(null);
  const [installState, setInstallState] = useState<InstallState>({ status: "idle" });
  const installAbortRef = useRef<AbortController | null>(null);

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
      const nextTts: TtsConfig = data.tts && typeof data.tts === "object"
        ? { engine: data.tts.engine === "piper" ? "piper" : "web", piperVoice: data.tts.piperVoice }
        : DEFAULT_TTS;
      setTtsConfig(nextTts);
      refreshTtsConfig(nextTts);
    }
  }, []);

  const fetchPiperStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/tts/status");
      if (res.ok) setPiperStatus(await res.json());
    } catch {
      // ignore
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
      fetchPiperStatus();
    }
  }, [open, fetchAgents, fetchConfig, fetchMcpServers, fetchWorkspacePermission, fetchPiperStatus]);

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

  const persistTtsConfig = useCallback(async (next: TtsConfig) => {
    setTtsConfig(next);
    refreshTtsConfig(next);
    await patchConfig({ tts: next });
  }, [patchConfig]);

  const handleTtsEngineChange = useCallback(async (engine: TtsEngine) => {
    const next: TtsConfig = engine === "piper"
      ? { engine: "piper", piperVoice: ttsConfig.piperVoice ?? piperStatus?.defaultVoice ?? "en_US-norman-medium" }
      : { engine: "web" };
    await persistTtsConfig(next);
  }, [ttsConfig.piperVoice, piperStatus?.defaultVoice, persistTtsConfig]);

  const handleInstallPiper = useCallback(async () => {
    const voiceId = ttsConfig.piperVoice ?? piperStatus?.defaultVoice ?? "en_US-norman-medium";
    const abort = new AbortController();
    installAbortRef.current = abort;
    setInstallState({ status: "installing", stage: "download-binary", label: "Starting…" });

    try {
      const res = await fetch("/api/tts/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        setInstallState({ status: "error", message: `Install failed: ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastError: string | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as InstallEvent;
            const nextState = installEventToState(event);
            if (event.stage === "error") lastError = event.message;
            if (nextState) setInstallState(nextState);
          } catch {
            // skip malformed line
          }
        }
      }

      if (lastError) {
        setInstallState({ status: "error", message: lastError });
      } else {
        setInstallState({ status: "idle" });
        await fetchPiperStatus();
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        setInstallState({ status: "idle" });
      } else {
        setInstallState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      installAbortRef.current = null;
    }
  }, [ttsConfig.piperVoice, piperStatus?.defaultVoice, fetchPiperStatus]);

  const handleCancelInstallPiper = useCallback(() => {
    installAbortRef.current?.abort();
    installAbortRef.current = null;
    setInstallState({ status: "idle" });
  }, []);

  const handleCloseInstallDialog = useCallback(() => {
    setInstallState({ status: "idle" });
  }, []);

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
            ttsConfig={ttsConfig}
            piperStatus={piperStatus}
            installState={installState}
            onTtsEngineChange={handleTtsEngineChange}
            onInstallPiper={handleInstallPiper}
            onCancelInstallPiper={handleCancelInstallPiper}
            onCloseInstallDialog={handleCloseInstallDialog}
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
