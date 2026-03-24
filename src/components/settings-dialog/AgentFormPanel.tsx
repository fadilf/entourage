"use client";

import type { AgentFormData } from "./types";
import { COLOR_PRESETS } from "./types";
import IconPicker from "../IconPicker";
import ModelIcon from "../ModelIcon";

type PromptTemplate = {
  label: string;
  description: string;
  patch: Partial<AgentFormData>;
};

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    label: "Wiggum Loop",
    description: "Autonomous task loop — reads TODO.md, implements, validates, commits, repeats",
    patch: {
      name: "Wiggum",
      avatarColor: "#f59e0b",
      personality: `You are a Wiggum loop agent — an autonomous task executor.

On each turn:
1. Read TODO.md and pick the highest-priority incomplete task.
2. Implement the change with minimal scope.
3. Run validation: build, lint, and tests.
4. If validation passes, commit with a descriptive message and mark the task done in TODO.md.
5. If validation fails, fix the issue and retry (up to 3 attempts). If still failing, mark the task as blocked in TODO.md and move on.
6. @yourself to continue the loop.

Stop when TODO.md has no remaining tasks or all are blocked.

Be disciplined: one task per iteration, small commits, always validate before committing.`,
    },
  },
  {
    label: "Critic",
    description: "Reviews code changes for bugs, security issues, and quality",
    patch: {
      name: "Critic",
      avatarColor: "#ef4444",
      personality: `You are a code critic. When mentioned, review the most recent code changes (git diff or the previous agent's work) for:
- Bugs and logic errors
- Security vulnerabilities (OWASP top 10)
- Performance issues
- Style and maintainability concerns

If you find issues, add them as new items in TODO.md with severity labels (critical/warning/nit). If the code looks good, say so briefly.

Be specific: reference file names and line numbers. Don't suggest rewrites unless the issue is critical.`,
    },
  },
  {
    label: "Scout",
    description: "Explores and maps codebases — architecture, data flow, dependencies",
    patch: {
      name: "Scout",
      avatarColor: "#3b82f6",
      personality: `You are a codebase explorer. When given a project, systematically map its structure:
- Directory layout and key modules
- Entry points and data flow
- External dependencies and integrations
- Auth boundaries and security surfaces
- Configuration and environment patterns

Produce structured output with sections. Be exhaustive but concise — facts over opinions. When done, @mention the next agent if instructed.`,
    },
  },
];


type AgentFormPanelProps = {
  form: AgentFormData;
  error: string;
  saving: boolean;
  editingAgentName?: string;
  onUpdate: (patch: Partial<AgentFormData>) => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
};

export default function AgentFormPanel({
  form,
  error,
  saving,
  editingAgentName,
  onUpdate,
  onCancel,
  onSave,
}: AgentFormPanelProps) {
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="e.g. Joker"
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          autoFocus
        />
      </div>

      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Model</label>
        <div className="mt-1 flex gap-1">
          {(["claude", "gemini", "codex"] as const).map((model) => (
            <button
              key={model}
              type="button"
              onClick={() => onUpdate({ model })}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                form.model === model
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              }`}
            >
              <ModelIcon model={model} className="h-3.5 w-3.5" />
              {model.charAt(0).toUpperCase() + model.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Color</label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onUpdate({ avatarColor: color })}
              className={`h-7 w-7 rounded-full transition-transform ${
                form.avatarColor === color
                  ? "scale-110 ring-2 ring-zinc-900 ring-offset-2 dark:ring-zinc-100 dark:ring-offset-zinc-800"
                  : "hover:scale-105"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
          <input
            type="text"
            value={form.avatarColor}
            onChange={(e) => onUpdate({ avatarColor: e.target.value })}
            className="w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
            placeholder="#hex"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Icon</label>
        <div className="mt-1">
          <IconPicker value={form.icon} onChange={(icon) => onUpdate({ icon })} />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Personality</label>
        {!editingAgentName && (
          <div className="mt-1 mb-2 flex flex-wrap gap-1.5">
            {PROMPT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => onUpdate(tpl.patch)}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:border-violet-500 dark:hover:bg-violet-900/30 dark:hover:text-violet-400"
                title={tpl.description}
              >
                {tpl.label}
              </button>
            ))}
            <span className="self-center text-[10px] text-zinc-400">templates</span>
          </div>
        )}
        <textarea
          value={form.personality ?? ""}
          onChange={(e) => onUpdate({ personality: e.target.value })}
          placeholder="System prompt for this agent. Supports markdown. Example: You are a meticulous code reviewer who focuses on security, performance, and maintainability..."
          rows={6}
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !form.name.trim()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saving ? "Saving..." : editingAgentName ? "Save Changes" : "Create Agent"}
        </button>
      </div>
    </div>
  );
}
