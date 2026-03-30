import { loadAgents, loadDefaultCliModels, loadDisplayName, loadUserIcon, loadUserColor, saveDefaultCliModels, saveDisplayName, saveUserIcon, saveUserColor, loadPlugins, savePlugins, loadQuickReplies, saveQuickReplies, loadToolCallGrouping, saveToolCallGrouping } from "@/lib/agent-store";
import { route, routeWithJson } from "@/lib/api-route";
import type { CliModelDefaults, Icon } from "@/lib/types";

type ConfigBody = {
  displayName?: string;
  defaultCliModels?: CliModelDefaults;
  plugins?: Record<string, boolean>;
  quickRepliesEnabled?: boolean;
  toolCallGroupingEnabled?: boolean;
  userIcon?: Icon | null;
  userColor?: string;
};

export const GET = route(async () => {
  const [agents, displayName, defaultCliModels, plugins, quickReplies, toolCallGrouping, userIcon, userColor] = await Promise.all([
    loadAgents(),
    loadDisplayName(),
    loadDefaultCliModels(),
    loadPlugins(),
    loadQuickReplies(),
    loadToolCallGrouping(),
    loadUserIcon(),
    loadUserColor(),
  ]);
  return { agents, displayName, defaultCliModels, plugins, quickReplies, toolCallGrouping, userIcon, userColor };
});

export const PATCH = routeWithJson<Record<string, never>, ConfigBody>(async ({ body }) => {
  if (typeof body.displayName === "string") {
    await saveDisplayName(body.displayName.trim());
  }

  if (body.defaultCliModels && typeof body.defaultCliModels === "object") {
    await saveDefaultCliModels(body.defaultCliModels);
  }

  if (body.plugins && typeof body.plugins === "object") {
    await savePlugins(body.plugins);
  }

  if (typeof body.quickRepliesEnabled === "boolean") {
    await saveQuickReplies({ enabled: body.quickRepliesEnabled });
  }

  if (typeof body.toolCallGroupingEnabled === "boolean") {
    await saveToolCallGrouping({ enabled: body.toolCallGroupingEnabled });
  }

  if (body.userIcon !== undefined) {
    await saveUserIcon(body.userIcon);
  }

  if (typeof body.userColor === "string") {
    await saveUserColor(body.userColor);
  }

  const [displayName, defaultCliModels, plugins, quickReplies, toolCallGrouping, userIcon, userColor] = await Promise.all([
    loadDisplayName(),
    loadDefaultCliModels(),
    loadPlugins(),
    loadQuickReplies(),
    loadToolCallGrouping(),
    loadUserIcon(),
    loadUserColor(),
  ]);
  return { displayName, defaultCliModels, plugins, quickReplies, toolCallGrouping, userIcon, userColor };
});
