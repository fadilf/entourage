"use client";

import { PLUGINS } from "@/lib/plugins";
import SettingsToggle from "./SettingsToggle";

type PluginsPanelProps = {
  plugins: Record<string, boolean>;
  onTogglePlugin: (pluginId: string, enabled: boolean) => void | Promise<void>;
};

export default function PluginsPanel({
  plugins,
  onTogglePlugin,
}: PluginsPanelProps) {
  return (
    <div className="space-y-1">
      <h4 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Plugins</h4>
      {PLUGINS.map((plugin) => {
        const enabled = plugins[plugin.id] ?? plugin.enabledByDefault;

        return (
          <div
            key={plugin.id}
            className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            <div>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {plugin.name}
              </span>
            </div>
            <SettingsToggle
              checked={enabled}
              onClick={() => onTogglePlugin(plugin.id, enabled)}
            />
          </div>
        );
      })}
    </div>
  );
}
