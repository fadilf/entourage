# Codex Agent Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenAI's Codex CLI as a third agent type alongside Claude and Gemini.

**Architecture:** Extend the existing `AgentModel` union type with `"codex"`, add a CLI command branch in `config.ts`, add a Codex-specific JSONL stream parser, generalize resume-failure detection in ProcessManager, and update 3 UI components.

**Tech Stack:** TypeScript, Next.js, React, Codex CLI (`codex exec --json`)

**Spec:** `docs/superpowers/specs/2026-03-17-codex-agent-support-design.md`

---

### Task 1: Type & Default Config

**Files:**
- Modify: `src/lib/types.ts:1`
- Modify: `src/lib/config.ts:12-29`

- [ ] **Step 1: Extend AgentModel type**

In `src/lib/types.ts`, change line 1:

```ts
export type AgentModel = "claude" | "gemini" | "codex";
```

- [ ] **Step 2: Add Codex default agent**

In `src/lib/config.ts`, add `"codex"` to `DEFAULT_AGENT_IDS` (line 12):

```ts
export const DEFAULT_AGENT_IDS = ["claude", "gemini", "codex"];
```

Add the Codex entry to `DEFAULT_AGENTS` array after the Gemini entry (after line 28):

```ts
{
  id: "codex",
  name: "Codex",
  model: "codex",
  avatarColor: "#10a37f",
  isDefault: true,
},
```

- [ ] **Step 3: Verify TypeScript compiles (expect errors in files not yet updated)**

Run: `npx tsc --noEmit 2>&1 | head -30`

Expected: Errors in `ModelIcon.tsx` (incomplete Record) and possibly `stream-parser.ts`. This confirms the type change propagated. No errors in `types.ts` or `config.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/config.ts
git commit -m "feat: add codex to AgentModel type and default agents"
```

---

### Task 2: CLI Command for Codex

**Files:**
- Modify: `src/lib/config.ts:31-64`

- [ ] **Step 1: Add Codex branch in getCliCommand()**

In `src/lib/config.ts`, insert a new `if (model === "codex")` block **before** the Gemini fallback (between the closing `}` of the Claude block at line 52 and the `// Gemini` comment at line 54):

```ts
if (model === "codex") {
  let effectivePrompt = fullPrompt;
  if (personality) {
    effectivePrompt = `[System Instructions]\n${personality}\n[End System Instructions]\n\n${fullPrompt}`;
  }

  const args: string[] = [];
  if (isResume) {
    args.push("exec", "resume", "--json", "--dangerously-bypass-approvals-and-sandbox", sessionId);
  } else {
    args.push("exec", "--json", "--dangerously-bypass-approvals-and-sandbox");
  }
  if (hasImages) {
    for (const p of imagePaths) {
      args.push("-i", p);
    }
  }
  args.push(effectivePrompt);

  return { cmd: "codex", args };
}
```

- [ ] **Step 2: Verify TypeScript compiles for config.ts**

Run: `npx tsc --noEmit 2>&1 | grep config.ts`

Expected: No errors from `config.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: add codex CLI command construction"
```

---

### Task 3: Stream Parser for Codex JSONL

**Files:**
- Modify: `src/lib/stream-parser.ts`

This is the most complex task. Codex emits JSONL with a different event schema than Claude/Gemini's `stream-json`. We add a unified `extractCodexEvents()` function that handles text, tools, and errors.

- [ ] **Step 1: Add the extractCodexEvents function**

Add before the existing `extractClaudeToolEvents` function (before line 86). This function returns a closure that tracks cumulative text lengths for delta extraction:

```ts
/**
 * Create a stateful Codex event extractor.
 * Tracks cumulative text per item ID to emit only deltas.
 *
 * Codex CLI (--json) emits JSONL with these event types:
 *   thread.started, turn.started, turn.completed, turn.failed, error
 *   item.started, item.updated, item.completed
 *
 * Item types: agent_message, command_execution, file_change,
 *   mcp_tool_call, reasoning, todo_list, web_search, error
 */
function createCodexEventExtractor(): (json: Record<string, unknown>) => StreamEvent[] {
  const lastTextLengths = new Map<string, number>();

  return (json: Record<string, unknown>): StreamEvent[] => {
    const events: StreamEvent[] = [];
    const type = json.type as string;

    // Stream-level error
    if (type === "error" && typeof json.message === "string") {
      events.push({ type: "error", message: json.message });
      return events;
    }

    // Turn failed
    if (type === "turn.failed") {
      const error = json.error as Record<string, unknown> | undefined;
      const message = typeof error?.message === "string" ? error.message : "Turn failed";
      events.push({ type: "error", message });
      return events;
    }

    // Item events
    if (type === "item.started" || type === "item.updated" || type === "item.completed") {
      const item = json.item as Record<string, unknown> | undefined;
      if (!item) return events;

      const itemType = item.type as string;
      const itemId = item.id as string;

      // Agent message — incremental text via delta tracking
      if (itemType === "agent_message" && typeof item.text === "string") {
        const fullText = item.text;
        const lastLen = lastTextLengths.get(itemId) ?? 0;
        if (fullText.length > lastLen) {
          events.push({ type: "content", text: fullText.slice(lastLen) });
          lastTextLengths.set(itemId, fullText.length);
        }
        return events;
      }

      // Command execution
      if (itemType === "command_execution") {
        if (type === "item.started") {
          events.push({
            type: "tool_start",
            toolId: itemId,
            toolName: "shell",
            input: typeof item.command === "string" ? item.command : undefined,
          });
        } else if (type === "item.completed") {
          events.push({
            type: "tool_result",
            toolId: itemId,
            output: typeof item.aggregated_output === "string" ? item.aggregated_output : "",
          });
        }
        return events;
      }

      // File change
      if (itemType === "file_change") {
        if (type === "item.started") {
          events.push({ type: "tool_start", toolId: itemId, toolName: "file_change" });
        } else if (type === "item.completed") {
          const changes = item.changes as Array<Record<string, string>> | undefined;
          const summary = Array.isArray(changes)
            ? changes.map((c) => `${c.kind}: ${c.path}`).join("\n")
            : "";
          events.push({ type: "tool_result", toolId: itemId, output: summary });
        }
        return events;
      }

      // MCP tool call
      if (itemType === "mcp_tool_call") {
        if (type === "item.started") {
          const toolName = typeof item.tool === "string" ? item.tool : "mcp_tool";
          const input = item.arguments ? JSON.stringify(item.arguments) : undefined;
          events.push({ type: "tool_start", toolId: itemId, toolName, input });
        } else if (type === "item.completed") {
          const error = item.error as Record<string, unknown> | undefined;
          if (error && typeof error.message === "string") {
            events.push({ type: "tool_result", toolId: itemId, output: `Error: ${error.message}` });
          } else {
            const result = item.result as Record<string, unknown> | undefined;
            const output = result ? JSON.stringify(result) : "";
            events.push({ type: "tool_result", toolId: itemId, output });
          }
        }
        return events;
      }

      // Error item
      if (itemType === "error" && typeof item.message === "string") {
        events.push({ type: "error", message: item.message });
        return events;
      }
    }

    // Skip: thread.started, turn.started, turn.completed, reasoning, todo_list, web_search, collab_tool_call
    return events;
  };
}
```

- [ ] **Step 2: Integrate into createStreamParser**

In `createStreamParser`, the Codex extractor must be created once (stateful) and invoked per JSON line. Modify the function:

After `let buffer = "";` (line 13), add:

```ts
const codexExtractor = model === "codex" ? createCodexEventExtractor() : null;
```

Inside the `try` block, after the error result handling (after line 38), add the Codex short-circuit before the Claude/Gemini blocks:

```ts
// Codex CLI events (from --json JSONL)
if (codexExtractor) {
  const codexEvents = codexExtractor(json);
  events.push(...codexEvents);
  continue;
}
```

- [ ] **Step 3: Update non-JSON line handling for Codex**

In the `catch` block (line 63), update the condition to also skip non-JSON lines for Codex:

No change needed here. The existing `model === "claude"` check already correctly skips non-JSON lines for both Gemini and Codex (since neither is `"claude"`). Leave as-is.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep stream-parser`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stream-parser.ts
git commit -m "feat: add Codex JSONL stream parser with incremental text"
```

---

### Task 4: ProcessManager Resume-Failure Detection

**Files:**
- Modify: `src/lib/process-manager.ts`

The ProcessManager has model-specific resume detection that assumes Claude/Gemini's `result` event format. Codex uses `turn.failed`/`error` instead.

- [ ] **Step 1: Add isResumeError helper and hasResumeSuccessSignal helper**

`AgentModel` is already imported on line 3. Add the helper functions after the `summarizeStderr` function (after line 39):

```ts
/**
 * Check if a parsed JSON line indicates a resume failure.
 */
function isResumeError(json: Record<string, unknown>, model: AgentModel): boolean {
  // Claude/Gemini: result event with error flag
  if (json.type === "result" && json.is_error === true) return true;
  // Codex: turn.failed or stream-level error
  if (model === "codex" && (json.type === "turn.failed" || json.type === "error")) return true;
  return false;
}

/**
 * Check if a parsed JSON line indicates the session is alive (resume succeeded).
 */
function hasSuccessSignal(json: Record<string, unknown>, model: AgentModel): boolean {
  if (model === "codex") {
    // Codex: item events or turn.started mean the session is active
    const t = json.type as string;
    return t === "item.started" || t === "item.updated" || t === "item.completed" || t === "turn.started";
  }
  // Claude/Gemini: anything that's not a "result" event
  return json.type !== "result";
}
```

- [ ] **Step 2: Update the deferred chunks logic in spawn()**

The `spawn` method needs the `model` parameter, which it already receives. Update the deferred chunks `hasNonErrorContent` check (around line 118-127).

Replace:
```ts
        const hasNonErrorContent = chunk.split("\n").some((line) => {
          const trimmed = line.trim();
          if (!trimmed) return false;
          try {
            const json = JSON.parse(trimmed);
            return json.type !== "result";
          } catch {
            return true; // Non-JSON output means real content
          }
        });
```

With:
```ts
        const hasNonErrorContent = chunk.split("\n").some((line) => {
          const trimmed = line.trim();
          if (!trimmed) return false;
          try {
            const json = JSON.parse(trimmed);
            return hasSuccessSignal(json, model);
          } catch {
            return model !== "codex"; // Non-JSON: real content for Claude, noise for Codex
          }
        });
```

- [ ] **Step 3: Update the close handler resume-failure check**

Replace the `resumeFailedWithError` check (around line 164-173):

```ts
      const resumeFailedWithError = isResume && entry.buffer.length > 0 && (() => {
        const output = entry.buffer.join("").trim();
        try {
          const lastLine = output.split("\n").filter(l => l.trim()).pop() ?? "";
          const json = JSON.parse(lastLine);
          return json.type === "result" && json.is_error === true;
        } catch {
          return false;
        }
      })();
```

With:
```ts
      const resumeFailedWithError = isResume && entry.buffer.length > 0 && (() => {
        const output = entry.buffer.join("").trim();
        try {
          const lastLine = output.split("\n").filter(l => l.trim()).pop() ?? "";
          const json = JSON.parse(lastLine);
          return isResumeError(json, model);
        } catch {
          return false;
        }
      })();
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep process-manager`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/process-manager.ts
git commit -m "feat: generalize resume-failure detection for Codex"
```

---

### Task 5: UI — ModelIcon

**Files:**
- Modify: `src/components/ModelIcon.tsx:4-7`

- [ ] **Step 1: Add Codex icon path**

In `src/components/ModelIcon.tsx`, update the `iconPaths` record (line 4-7):

```ts
const iconPaths: Record<AgentModel, string> = {
  claude: "/agent-icons/Claude_AI_symbol.svg",
  gemini: "/agent-icons/Google_Gemini_icon_2025.svg",
  codex: "/agent-icons/codex-color.svg",
};
```

- [ ] **Step 2: Verify the icon file exists**

Run: `ls -la public/agent-icons/codex-color.svg`

Expected: File exists.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep ModelIcon`

Expected: No errors. The `Record<AgentModel, string>` now requires all 3 keys.

- [ ] **Step 4: Commit**

```bash
git add src/components/ModelIcon.tsx
git commit -m "feat: add Codex icon to ModelIcon component"
```

---

### Task 6: UI — SettingsDialog Model Picker

**Files:**
- Modify: `src/components/SettingsDialog.tsx:226`

- [ ] **Step 1: Add codex to model picker array**

In `src/components/SettingsDialog.tsx`, change line 226:

From:
```tsx
{(["claude", "gemini"] as const).map((m) => (
```

To:
```tsx
{(["claude", "gemini", "codex"] as const).map((m) => (
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SettingsDialog.tsx
git commit -m "feat: add Codex to model picker in settings"
```

---

### Task 7: UI — MessageInput Icon Fix

**Files:**
- Modify: `src/components/MessageInput.tsx:1-8,225-229`

- [ ] **Step 1: Import ModelIcon**

In `src/components/MessageInput.tsx`, add the import after the existing imports (after line 6):

```ts
import ModelIcon from "./ModelIcon";
```

- [ ] **Step 2: Replace hardcoded ternary with ModelIcon**

Replace lines 225-229:

```tsx
                <img
                  src={`/agent-icons/${agent.model === "claude" ? "Claude_AI_symbol" : "Google_Gemini_icon_2025"}.svg`}
                  alt={agent.model}
                  className="h-3 w-3"
                />
```

With:

```tsx
                <ModelIcon model={agent.model} icon={agent.icon} className="h-3 w-3" />
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`

Expected: No errors at all. All files should compile cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/components/MessageInput.tsx
git commit -m "feat: use ModelIcon in mention autocomplete for Codex support"
```

---

### Task 8: Build Verification

- [ ] **Step 1: Run full build**

Run: `npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: No lint errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server: `npm run dev`

Verify:
1. Settings dialog shows 3 model options (Claude, Gemini, Codex) in the model picker
2. New Thread dialog shows the Codex default agent with the green icon
3. Creating a custom agent with model "Codex" works
4. @mention autocomplete shows Codex agents with the correct icon
