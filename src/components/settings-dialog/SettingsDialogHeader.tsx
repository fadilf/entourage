"use client";

import { ArrowLeft } from "lucide-react";
import { SETTINGS_TABS, type Tab } from "./types";

type SettingsDialogHeaderProps = {
  showForm: boolean;
  editingAgentName?: string;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onBack: () => void;
  onClose: () => void;
};

export default function SettingsDialogHeader({
  showForm,
  editingAgentName,
  tab,
  onTabChange,
  onBack,
  onClose,
}: SettingsDialogHeaderProps) {
  return (
    <div className="border-b border-zinc-200 px-4 md:px-6 dark:border-zinc-700">
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          {showForm && (
            <button
              onClick={onBack}
              className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {showForm ? editingAgentName ? `Edit ${editingAgentName}` : "New Agent" : "Settings"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-xl leading-none text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          &times;
        </button>
      </div>
      {!showForm && (
        <div className="-mb-px flex gap-1">
          {SETTINGS_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
