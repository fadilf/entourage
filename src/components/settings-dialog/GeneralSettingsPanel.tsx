"use client";

import type { AgentModel, Icon, PermissionLevel } from "@/lib/types";
import { Moon, Sun, X } from "lucide-react";
import SettingsToggle from "./SettingsToggle";
import { COLOR_PRESETS, PERMISSION_LEVELS } from "./types";
import IconPicker, { renderIcon } from "../IconPicker";

const DEFAULT_MODEL_FIELDS: ReadonlyArray<{
  model: AgentModel;
  label: string;
  placeholder: string;
}> = [
  { model: "claude", label: "Claude", placeholder: "e.g. sonnet or claude-sonnet-4-6" },
  { model: "gemini", label: "Gemini", placeholder: "e.g. gemini-2.5-pro" },
  { model: "codex", label: "Codex", placeholder: "e.g. gpt-5.4" },
];

type GeneralSettingsPanelProps = {
  mounted: boolean;
  resolvedTheme?: string;
  displayName: string;
  savedDisplayName: string;
  defaultCliModels: Record<AgentModel, string>;
  savedDefaultCliModels: Record<AgentModel, string>;
  quickRepliesEnabled: boolean;
  toolCallGroupingEnabled: boolean;
  wsPermissionLevel: PermissionLevel;
  userIcon?: Icon;
  userColor: string;
  savedUserIcon?: Icon;
  savedUserColor: string;
  onUserIconChange: (icon: Icon | null) => void;
  onUserColorChange: (color: string) => void;
  onSaveUserProfile: () => void | Promise<void>;
  onToggleTheme: () => void;
  onDisplayNameChange: (value: string) => void;
  onSaveDisplayName: () => void | Promise<void>;
  onDefaultCliModelChange: (model: AgentModel, value: string) => void;
  onSaveDefaultCliModels: () => void | Promise<void>;
  onToggleQuickReplies: () => void | Promise<void>;
  onToggleToolCallGrouping: () => void | Promise<void>;
  onPermissionLevelChange: (value: PermissionLevel) => void | Promise<void>;
};

export default function GeneralSettingsPanel({
  mounted,
  resolvedTheme,
  displayName,
  savedDisplayName,
  userIcon,
  userColor,
  savedUserIcon,
  savedUserColor,
  onUserIconChange,
  onUserColorChange,
  onSaveUserProfile,
  defaultCliModels,
  savedDefaultCliModels,
  quickRepliesEnabled,
  toolCallGroupingEnabled,
  wsPermissionLevel,
  onToggleTheme,
  onDisplayNameChange,
  onSaveDisplayName,
  onDefaultCliModelChange,
  onSaveDefaultCliModels,
  onToggleQuickReplies,
  onToggleToolCallGrouping,
  onPermissionLevelChange,
}: GeneralSettingsPanelProps) {
  const hasDefaultCliModelChanges = DEFAULT_MODEL_FIELDS.some(
    ({ model }) => defaultCliModels[model] !== savedDefaultCliModels[model]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Theme</span>
        {mounted && (
          <button
            onClick={onToggleTheme}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
          >
            {resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* Profile section */}
      <div className="px-3 py-2.5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Live avatar preview */}
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
              style={{
                backgroundColor: "var(--background)",
                border: `1.5px solid ${userColor}`,
                boxShadow: `inset 0 2px 6px ${userColor}80`,
              }}
            >
              {userIcon ? (
                renderIcon(userIcon, "h-5 w-5")
              ) : (
                <span className="text-sm font-semibold" style={{ color: userColor }}>
                  {displayName
                    .trim()
                    .split(/\s+/)
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "?"}
                </span>
              )}
            </div>
            <div>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Profile</span>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Customize your chat avatar</p>
            </div>
          </div>
          {(userIcon !== savedUserIcon || userColor !== savedUserColor) && (
            <button
              onClick={onSaveUserProfile}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Save
            </button>
          )}
        </div>

        {/* Color swatches */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Color</label>
          <div className="flex flex-wrap items-center gap-2">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onUserColorChange(color)}
                className={`h-7 w-7 rounded-full transition-transform ${
                  userColor === color
                    ? "scale-110 ring-2 ring-zinc-900 ring-offset-2 dark:ring-zinc-100 dark:ring-offset-zinc-800"
                    : "hover:scale-105"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Icon picker */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Icon</label>
            {userIcon && (
              <button
                type="button"
                onClick={() => onUserIconChange(null)}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
                Remove
              </button>
            )}
          </div>
          <IconPicker
            value={userIcon}
            onChange={(icon) => onUserIconChange(icon)}
            enableUpload
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Display Name</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="Your name"
            className="w-48 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          />
          {displayName !== savedDisplayName && (
            <button
              onClick={onSaveDisplayName}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Save
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2.5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Default Provider Models
            </span>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Used when an agent profile leaves Provider Model blank
            </p>
          </div>
          {hasDefaultCliModelChanges && (
            <button
              onClick={onSaveDefaultCliModels}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Save
            </button>
          )}
        </div>

        <div className="space-y-2">
          {DEFAULT_MODEL_FIELDS.map(({ model, label, placeholder }) => (
            <div key={model} className="flex items-center gap-3">
              <label className="w-16 shrink-0 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {label}
              </label>
              <input
                type="text"
                value={defaultCliModels[model]}
                onChange={(e) => onDefaultCliModelChange(model, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2.5">
        <div>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Quick Replies{" "}
            <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
              beta
            </span>
          </span>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Suggest follow-up replies after agents respond
          </p>
        </div>
        <SettingsToggle checked={quickRepliesEnabled} onClick={onToggleQuickReplies} />
      </div>

      <div className="flex items-center justify-between px-3 py-2.5">
        <div>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Group Tool Calls</span>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Collapse consecutive tool calls into an accordion
          </p>
        </div>
        <SettingsToggle checked={toolCallGroupingEnabled} onClick={onToggleToolCallGrouping} />
      </div>

      <div className="px-3 py-2.5">
        <div className="mb-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Default Permission Level
          </span>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Controls what agents can do in new threads for this workspace
          </p>
        </div>
        <div className="space-y-1">
          {PERMISSION_LEVELS.map(({ value, label, description, icon: IconComp }) => (
            <button
              key={value}
              onClick={() => onPermissionLevelChange(value)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                wsPermissionLevel === value
                  ? "bg-zinc-100 ring-1 ring-zinc-300 dark:bg-zinc-700 dark:ring-zinc-600"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
              }`}
            >
              <IconComp
                className={`h-4 w-4 shrink-0 ${
                  value === "full"
                    ? "text-emerald-600"
                    : value === "auto-edit"
                      ? "text-blue-600"
                      : "text-amber-600"
                }`}
              />
              <div className="min-w-0">
                <div
                  className={`text-sm ${
                    wsPermissionLevel === value
                      ? "font-semibold text-zinc-900 dark:text-zinc-100"
                      : "font-medium text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {label}
                </div>
                <div className="text-xs text-zinc-400 dark:text-zinc-500">{description}</div>
              </div>
              {wsPermissionLevel === value && (
                <span className="ml-auto text-violet-600 dark:text-violet-400">&#10003;</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
