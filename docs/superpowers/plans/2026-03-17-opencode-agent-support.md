# OpenCode Agent Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenCode as a CLI agent alongside Claude, Gemini, and Codex using `opencode run --format json`.

**Architecture:** Extend the existing agent pattern — add `"opencode"` to the type union, add a default agent entry, implement CLI command construction, build a JSONL stream parser, and wire up resume/session handling in the process manager.

**Tech Stack:** TypeScript, Next.js (App Router), Node.js child_process

---

### Task 1: Type & Config — Add OpenCode as a Model

**Files:**
- Modify: `src/lib/types.ts:1`
- Modify: `src/lib/config.ts:12-36`

- [ ] **Step 1: Add `"opencode"` to `AgentModel` type union**

In `src/lib/types.ts`, change line 1:

```typescript
export type AgentModel = "claude" | "gemini" | "codex" | "opencode";
```

- [ ] **Step 2: Add `"opencode"` to `DEFAULT_AGENT_IDS` and `DEFAULT_AGENTS`**

In `src/lib/config.ts`, change line 12:

```typescript
export const DEFAULT_AGENT_IDS = ["claude", "gemini", "codex", "opencode"];
```

Add after the Codex entry (after line 35):

```typescript
  {
    id: "opencode",
    name: "OpenCode",
    model: "opencode",
    avatarColor: "#6366f1",
    isDefault: true,
  },
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build errors in `config.ts`, `stream-parser.ts`, `ModelIcon.tsx` about unhandled `"opencode"` cases. This is expected — we'll fix them in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/config.ts
git commit -m "feat: add opencode to AgentModel type and default agents"
```

---

### Task 2: CLI Command Construction

**Files:**
- Modify: `src/lib/config.ts:38-93`

- [ ] **Step 1: Add OpenCode branch to `getCliCommand()` before the Gemini fallthrough**

In `src/lib/config.ts`, insert the following block after the Codex `if` block (after line 81) and before the Gemini fallthrough comment (line 83):

```typescript
  if (model === "opencode") {
    let effectivePrompt = fullPrompt;
    if (personality) {
      effectivePrompt = `[System Instructions]\n${personality}\n[End System Instructions]\n\n${effectivePrompt}`;
    }
    const args = ["run", "--format", "json"];
    if (isResume) {
      args.push("--session", sessionId);
    }
    if (hasImages) {
      for (const p of imagePaths) {
        args.push("-f", p);
      }
    }
    args.push(effectivePrompt);
    return { cmd: "opencode", args };
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: add opencode CLI command construction"
```

---

### Task 3: Stream Parser

**Files:**
- Modify: `src/lib/stream-parser.ts:12-83` (main parser function)
- Modify: `src/lib/stream-parser.ts` (add new extractor function)

- [ ] **Step 1: Add `createOpenCodeEventExtractor()` function**

Add after the `createCodexEventExtractor()` function (after line 198) in `src/lib/stream-parser.ts`:

```typescript
/**
 * Create a stateful OpenCode event extractor.
 *
 * OpenCode CLI (--format json) emits JSONL with these event types:
 *   step_start, text, tool_use, step_finish
 *
 * Tool events arrive with state.status "completed" containing both
 * input and output in a single event.
 */
function createOpenCodeEventExtractor(): (json: Record<string, unknown>) => StreamEvent[] {
  return (json: Record<string, unknown>): StreamEvent[] => {
    const events: StreamEvent[] = [];
    const type = json.type as string;

    // Text content
    if (type === "text") {
      const part = json.part as Record<string, unknown> | undefined;
      if (part && typeof part.text === "string") {
        events.push({ type: "content", text: part.text });
      }
      return events;
    }

    // Tool use — OpenCode sends completed tool calls with input + output in one event
    if (type === "tool_use") {
      const part = json.part as Record<string, unknown> | undefined;
      if (part) {
        const callID = typeof part.callID === "string" ? part.callID : "unknown";
        const toolName = typeof part.tool === "string" ? part.tool : "tool";
        const state = part.state as Record<string, unknown> | undefined;
        const input = state?.input ? JSON.stringify(state.input) : undefined;
        events.push({ type: "tool_start", toolId: callID, toolName, input });

        if (state?.status === "completed") {
          const output = typeof state.output === "string" ? state.output : JSON.stringify(state.output ?? "");
          events.push({ type: "tool_result", toolId: callID, output });
        }
      }
      return events;
    }

    // Step finish with reason "stop" means the agent is done
    if (type === "step_finish") {
      const part = json.part as Record<string, unknown> | undefined;
      if (part?.reason === "stop") {
        events.push({ type: "done", status: "complete" });
      }
      return events;
    }

    // step_start and other events are silently consumed
    return events;
  };
}
```

- [ ] **Step 2: Wire the extractor into `createStreamParser()`**

In `src/lib/stream-parser.ts`, modify the `createStreamParser()` function.

Change line 14 from:
```typescript
  const codexExtractor = model === "codex" ? createCodexEventExtractor() : null;
```
to:
```typescript
  const codexExtractor = model === "codex" ? createCodexEventExtractor() : null;
  const openCodeExtractor = model === "opencode" ? createOpenCodeEventExtractor() : null;
```

Then insert after the Codex extractor block (after line 46, the `continue;` inside the `if (codexExtractor)` block):

```typescript
        // OpenCode CLI events (from --format json JSONL)
        if (openCodeExtractor) {
          const openCodeEvents = openCodeExtractor(json);
          events.push(...openCodeEvents);
          continue;
        }
```

- [ ] **Step 3: Handle non-JSON lines for OpenCode**

In the `catch` block (lines 71-78), update to also skip non-JSON lines for OpenCode (like Codex/Gemini):

Change from:
```typescript
      } catch {
        // Not JSON — only treat as content for Claude (which may emit plain text)
        // For Gemini, non-JSON lines are diagnostic noise (errors, warnings, etc.)
        if (trimmed && model === "claude") {
          events.push({ type: "content", text: trimmed });
        }
        // For Gemini, skip non-JSON lines entirely — they're stderr-like diagnostics
      }
```
to:
```typescript
      } catch {
        // Not JSON — only treat as content for Claude (which may emit plain text)
        // For Gemini/Codex/OpenCode, non-JSON lines are diagnostic noise
        if (trimmed && model === "claude") {
          events.push({ type: "content", text: trimmed });
        }
      }
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/stream-parser.ts
git commit -m "feat: add opencode stream parser with JSONL event extraction"
```

---

### Task 4: Process Manager — Resume & Session Handling

**Files:**
- Modify: `src/lib/process-manager.ts:44-63` (resume detection functions)
- Modify: `src/lib/process-manager.ts:65-93` (ProcessManager class — session storage)
- Modify: `src/lib/process-manager.ts:146-175` (deferred chunks logic)
- Modify: `src/lib/process-manager.ts:199-267` (retry logic)

- [ ] **Step 1: Add `openCodeSessions` map and `model` to ProcessEntry**

In `src/lib/process-manager.ts`, add `model` to the `ProcessEntry` type (after line 9, add `model: AgentModel;`):

```typescript
type ProcessEntry = {
  process: ChildProcess;
  threadId: string;
  agentId: string;
  model: AgentModel;
  status: "running" | "error";
  buffer: string[];
  stderrBuffer: string[];
  accumulatedContent: string;
};
```

Add after line 69 (the `sessionOverrides` line):

```typescript
  private openCodeSessions = new Map<string, string>(); // OpenCode-generated ses_* IDs
```

Update the `entry` construction in `spawn()` (around line 132) to include `model`:

```typescript
    const entry: ProcessEntry = {
      process: child,
      threadId,
      agentId,
      model,
      status: "running",
      buffer: [],
      stderrBuffer: [],
      accumulatedContent: "",
    };
```

Also update the `retryEntry` construction (around line 226) similarly to include `model`.

- [ ] **Step 2: Modify `getSessionId()` to check `openCodeSessions`**

Change `getSessionId()` at lines 89-92 from:
```typescript
  private getSessionId(threadId: string, agentId: string): string {
    const k = this.key(threadId, agentId);
    return this.sessionOverrides.get(k) ?? this.baseSessionId(threadId, agentId);
  }
```
to:
```typescript
  private getSessionId(threadId: string, agentId: string, model?: AgentModel): string {
    const k = this.key(threadId, agentId);
    if (model === "opencode") {
      return this.openCodeSessions.get(k) ?? "";
    }
    return this.sessionOverrides.get(k) ?? this.baseSessionId(threadId, agentId);
  }
```

- [ ] **Step 3: Update all `getSessionId()` call sites to pass `model`**

At line 117: change `this.getSessionId(threadId, agentId)` to `this.getSessionId(threadId, agentId, model)`.

At line 327 (inside `killByThread`): change to `this.getSessionId(entry.threadId, entry.agentId, entry.model)` since `ProcessEntry` now has `model`. Also add cleanup: after `this.killedSessions.add(sessionId)`, add `if (entry.model === "opencode") this.openCodeSessions.delete(this.key(entry.threadId, entry.agentId));`.

At line 353 (inside `resetSessions`): leave as-is — `resetSessions` is for rewind which generates new random UUIDs, not applicable to OpenCode's external session model.

- [ ] **Step 4: Add OpenCode branches to `isResumeError()` and `hasSuccessSignal()`**

Change `isResumeError()` at lines 44-50 from:
```typescript
function isResumeError(json: Record<string, unknown>, model: AgentModel): boolean {
  // Claude/Gemini: result event with error flag
  if (json.type === "result" && json.is_error === true) return true;
  // Codex: turn.failed or stream-level error
  if (model === "codex" && (json.type === "turn.failed" || json.type === "error")) return true;
  return false;
}
```
to:
```typescript
function isResumeError(json: Record<string, unknown>, model: AgentModel): boolean {
  // Claude/Gemini: result event with error flag
  if (json.type === "result" && json.is_error === true) return true;
  // Codex: turn.failed or stream-level error
  if (model === "codex" && (json.type === "turn.failed" || json.type === "error")) return true;
  // OpenCode: resume errors come as non-JSON (NotFoundError stack trace), not as JSON events
  return false;
}
```

Change `hasSuccessSignal()` at lines 55-63 from:
```typescript
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
to:
```typescript
function hasSuccessSignal(json: Record<string, unknown>, model: AgentModel): boolean {
  if (model === "codex") {
    // Codex: item events or turn.started mean the session is active
    const t = json.type as string;
    return t === "item.started" || t === "item.updated" || t === "item.completed" || t === "turn.started";
  }
  if (model === "opencode") {
    const t = json.type as string;
    return t === "step_start" || t === "text" || t === "tool_use";
  }
  // Claude/Gemini: anything that's not a "result" event
  return json.type !== "result";
}
```

- [ ] **Step 5: Handle OpenCode session ID capture and resume logic**

In the `spawn()` method, after deferred chunks are flushed (the `hasNonErrorContent` block around lines 156-175), we need to capture OpenCode's session ID. Modify the `child.stdout?.on("data", ...)` handler.

After the existing `if (hasNonErrorContent)` block inside the deferred chunks check, add session ID capture. Replace the entire `child.stdout?.on("data", ...)` handler (lines 148-179):

```typescript
    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      entry.buffer.push(chunk);
      if (entry.buffer.length > MAX_BUFFER_CHUNKS) {
        entry.buffer.shift();
      }

      // Capture OpenCode session ID from JSON events (always overwrite — handles retry spawns)
      if (model === "opencode") {
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);
            if (typeof json.sessionID === "string") {
              this.openCodeSessions.set(k, json.sessionID);
            }
          } catch { /* non-JSON line */ }
        }
      }

      if (deferredChunks) {
        // Check if this chunk contains a non-error line, meaning resume succeeded
        const hasNonErrorContent = chunk.split("\n").some((line) => {
          const trimmed = line.trim();
          if (!trimmed) return false;
          try {
            const json = JSON.parse(trimmed);
            return hasSuccessSignal(json, model);
          } catch {
            return model !== "codex" && model !== "opencode"; // Non-JSON: real content for Claude, noise for Codex/OpenCode
          }
        });
        if (hasNonErrorContent) {
          // Resume succeeded — flush deferred chunks and switch to direct forwarding
          for (const deferred of deferredChunks) {
            onData(deferred);
          }
          deferredChunks = null;
          onData(chunk);
        } else {
          deferredChunks.push(chunk);
        }
      } else {
        onData(chunk);
      }
    });
```

- [ ] **Step 6: Handle OpenCode resume retry — no `--session` flag on fresh start**

In the retry block (around lines 216-267), after `if (isResume && (entry.buffer.length === 0 || resumeFailedWithError))`, the retry currently passes `sessionId` and `false` for `isResume`. For OpenCode, we also need to handle the case where resume fails via non-JSON output (NotFoundError).

Before the retry spawn, clear the stale OpenCode session so the new session ID will be captured. Add `this.openCodeSessions.delete(k);` inside the `if (isResume && ...)` retry block, before spawning the retry child.

Change the `resumeFailedWithError` check (lines 202-211) to also detect OpenCode-style non-JSON errors:

```typescript
      const resumeFailedWithError = isResume && entry.buffer.length > 0 && (() => {
        const output = entry.buffer.join("").trim();
        // OpenCode: resume failure outputs a NotFoundError stack trace (non-JSON)
        if (model === "opencode" && output.includes("NotFoundError")) return true;
        try {
          const lastLine = output.split("\n").filter(l => l.trim()).pop() ?? "";
          const json = JSON.parse(lastLine);
          return isResumeError(json, model);
        } catch {
          return false;
        }
      })();
```

- [ ] **Step 7: Adjust `isResume` computation for OpenCode**

At line 119, `isResume` is currently:
```typescript
    const isResume = (this.usedSessions.has(sessionId) || hasHistory) && !wasRewound;
```

For OpenCode, we should only attempt resume if we have a stored OpenCode session ID. The `sessionId` variable at this point will be empty string for OpenCode (from `getSessionId()`), so `usedSessions.has("")` will be false. However, `hasHistory` could be true, which would trigger an invalid resume attempt with empty `--session`.

Change lines 117-119 from:
```typescript
    const sessionId = this.getSessionId(threadId, agentId);
    const wasRewound = this.sessionOverrides.has(k);
    const isResume = (this.usedSessions.has(sessionId) || hasHistory) && !wasRewound;
```
to:
```typescript
    const sessionId = this.getSessionId(threadId, agentId, model);
    const wasRewound = this.sessionOverrides.has(k);
    const isResume = model === "opencode"
      ? (!!sessionId && (this.usedSessions.has(sessionId) || hasHistory)) && !wasRewound
      : (this.usedSessions.has(sessionId) || hasHistory) && !wasRewound;
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/process-manager.ts
git commit -m "feat: add opencode session management and resume handling"
```

---

### Task 5: UI — Icon and Settings

**Files:**
- Modify: `src/components/ModelIcon.tsx:4-8`
- Modify: `src/components/SettingsDialog.tsx:250`
- Create: `public/agent-icons/opencode.svg`

- [ ] **Step 1: Add OpenCode SVG icon**

Create `public/agent-icons/opencode.svg`. Use a simple terminal/code icon that represents OpenCode's branding (indigo themed):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="4 17 10 11 4 5"/>
  <line x1="12" y1="19" x2="20" y2="19"/>
</svg>
```

Note: If a proper OpenCode brand SVG is available, replace this placeholder.

- [ ] **Step 2: Add icon path to `ModelIcon.tsx`**

In `src/components/ModelIcon.tsx`, change lines 4-8 from:
```typescript
const iconPaths: Record<AgentModel, string> = {
  claude: "/agent-icons/Claude_AI_symbol.svg",
  gemini: "/agent-icons/Google_Gemini_icon_2025.svg",
  codex: "/agent-icons/codex-color.svg",
};
```
to:
```typescript
const iconPaths: Record<AgentModel, string> = {
  claude: "/agent-icons/Claude_AI_symbol.svg",
  gemini: "/agent-icons/Google_Gemini_icon_2025.svg",
  codex: "/agent-icons/codex-color.svg",
  opencode: "/agent-icons/opencode.svg",
};
```

- [ ] **Step 3: Add `"opencode"` to model selector in `SettingsDialog.tsx`**

In `src/components/SettingsDialog.tsx`, change line 250 from:
```typescript
                  {(["claude", "gemini", "codex"] as const).map((m) => (
```
to:
```typescript
                  {(["claude", "gemini", "codex", "opencode"] as const).map((m) => (
```

- [ ] **Step 4: Commit**

```bash
git add public/agent-icons/opencode.svg src/components/ModelIcon.tsx src/components/SettingsDialog.tsx
git commit -m "feat: add opencode icon and UI model selector"
```

---

### Task 6: Build & Smoke Test

- [ ] **Step 1: Run the build**

Run: `npm run build 2>&1 | tail -30`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Run the linter**

Run: `npm run lint 2>&1 | tail -20`
Expected: No lint errors.

- [ ] **Step 3: Start dev server and verify**

Run: `npm run dev`
Verify manually:
1. Open http://localhost:5555
2. OpenCode appears in the agent list for new threads
3. Settings > Agent Profiles shows OpenCode with indigo color
4. Creating a new agent shows OpenCode in the model selector
5. Sending a message to OpenCode agent spawns `opencode run --format json` and streams responses

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address build/lint issues for opencode integration"
```
