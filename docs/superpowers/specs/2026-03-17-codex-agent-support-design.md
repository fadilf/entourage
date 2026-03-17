# Codex Agent Support Design

**Date:** 2026-03-17
**Approach:** Direct Integration (Approach A)

## Summary

Add OpenAI's Codex CLI as a third agent type alongside Claude and Gemini. Follows the existing pattern: new `AgentModel` value, CLI command branch, stream parser branch, and UI updates.

## Files to Change

1. `src/lib/types.ts` — Extend `AgentModel` union
2. `src/lib/config.ts` — Default agent + CLI command
3. `src/lib/stream-parser.ts` — JSONL event parsing
4. `src/lib/process-manager.ts` — Generalize resume-failure detection for Codex
5. `src/components/ModelIcon.tsx` — Icon path
6. `src/components/SettingsDialog.tsx` — Model picker
7. `src/components/MessageInput.tsx` — Replace ternary with `ModelIcon` component
8. `public/agent-icons/codex-color.svg` — Already exists

No changes needed to: API routes, thread/agent persistence, @mention routing, or re-attachment logic.

## 1. Type & Config

### types.ts

```ts
export type AgentModel = "claude" | "gemini" | "codex";
```

### config.ts

Add to `DEFAULT_AGENT_IDS`:
```ts
export const DEFAULT_AGENT_IDS = ["claude", "gemini", "codex"];
```

Add to `DEFAULT_AGENTS`:
```ts
{
  id: "codex",
  name: "Codex",
  model: "codex",
  avatarColor: "#10a37f",
  isDefault: true,
}
```

New branch in `getCliCommand()`:
```ts
if (model === "codex") {
  let effectivePrompt = fullPrompt;
  if (personality) {
    effectivePrompt = `[System Instructions]\n${personality}\n[End System Instructions]\n\n${fullPrompt}`;
  }

  if (isResume) {
    return {
      cmd: "codex",
      args: ["exec", "resume", "--json", "--dangerously-bypass-approvals-and-sandbox", sessionId, effectivePrompt],
    };
  }
  return {
    cmd: "codex",
    args: ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox", effectivePrompt],
  };
}
```

Image support: Codex supports `-i <file>` flags. Add image paths as `-i path1 -i path2` before the prompt argument:
```ts
if (hasImages) {
  for (const p of imagePaths) {
    args.push("-i", p);
  }
}
args.push(effectivePrompt);
```

## 2. Stream Parser

Codex's `--json` flag emits JSONL with a different event schema than Claude/Gemini's `stream-json`.

### Codex JSONL Event Types

| Event `type` | Description |
|---|---|
| `thread.started` | Session started; contains `thread_id` |
| `turn.started` | Model turn begins |
| `turn.completed` | Turn finished; contains `usage` |
| `turn.failed` | Turn failed; contains `error.message` |
| `item.started` | Item in progress; contains `item` |
| `item.updated` | Item updated; contains `item` |
| `item.completed` | Item finished; contains `item` |
| `error` | Stream-level error; contains `message` |

### Item Types (inside `item.started`/`item.updated`/`item.completed`)

| `item.type` | Maps to StreamEvent | Description |
|---|---|---|
| `agent_message` | `content` | Text response; `item.text` |
| `reasoning` | (skip) | Internal reasoning summary |
| `command_execution` | `tool_start` / `tool_result` | Shell command; `item.command`, `item.aggregated_output`, `item.exit_code` |
| `file_change` | `tool_start` / `tool_result` | File edits; `item.changes[]` with `path` and `kind` |
| `mcp_tool_call` | `tool_start` / `tool_result` | MCP tool; `item.tool`, `item.arguments`, `item.result` |
| `todo_list` | (skip) | Agent's plan; `item.items[]` |
| `web_search` | (skip) | Web search; not surfaced as tool |
| `error` | `error` | Non-fatal error item; `item.message` |

### Mapping to StreamEvent

**Text content (incremental streaming):**
- `item.started` / `item.updated` / `item.completed` with `item.type === "agent_message"` → emit `{ type: "content", text: delta }`
- Codex emits cumulative `item.text` on each update. The parser tracks last-seen text length per item ID and emits only the new delta to avoid duplicating content. This ensures text streams incrementally to the UI, matching the Claude/Gemini experience.

**Tool events:**
- `item.started` with `item.type === "command_execution"` → `{ type: "tool_start", toolId: item.id, toolName: "shell", input: item.command }`
- `item.completed` with `item.type === "command_execution"` → `{ type: "tool_result", toolId: item.id, output: item.aggregated_output }`
- `item.started` with `item.type === "file_change"` → `{ type: "tool_start", toolId: item.id, toolName: "file_change" }`
- `item.completed` with `item.type === "file_change"` → `{ type: "tool_result", toolId: item.id, output: changes summary }`
- `item.started` with `item.type === "mcp_tool_call"` → `{ type: "tool_start", toolId: item.id, toolName: item.tool, input: JSON.stringify(item.arguments) }`
- `item.completed` with `item.type === "mcp_tool_call"` → `{ type: "tool_result", toolId: item.id, output: result or error }`

**Errors:**
- `{"type":"error","message":"..."}` → `{ type: "error", message }`
- `{"type":"turn.failed","error":{"message":"..."}}` → `{ type: "error", message }`
- `item.completed` with `item.type === "error"` → `{ type: "error", message: item.message }`

**Skipped events:** `thread.started`, `turn.started`, `turn.completed`, `reasoning`, `todo_list`, `web_search`, `collab_tool_call`

**Non-JSON lines:** Skip silently (like Gemini).

### New function: `extractCodexEvents(json)`

Handles all Codex-specific event extraction in one function (both tool events and text), since Codex events are structurally different enough to warrant a unified handler rather than splitting across `extractToolEvents` + `extractText`.

**Integration point in `createStreamParser`:**
```ts
if (model === "codex") {
  const codexEvents = extractCodexEvents(json);
  events.push(...codexEvents);
  continue; // Skip Claude/Gemini extractors entirely
}
```

The function is stateful (closure over `lastTextLengths: Map<string, number>`) to track cumulative text for delta extraction from `agent_message` items.

## 3. Session Management & ProcessManager Changes

**New session:** `codex exec <prompt>` — Codex auto-generates a `thread_id` (returned in `thread.started`). We use the ProcessManager's hash-based session ID.

**Resume:** `codex exec resume <sessionId> <prompt>` — subcommand pattern, not a flag.

**Resume failure retry:** Same pattern as Claude/Gemini. If resume fails (empty output or error), retry with fresh `codex exec` using full history prompt.

### ProcessManager resume-failure detection (critical fix)

The current ProcessManager has two places with model-specific resume detection that assume Claude/Gemini's `stream-json` format:

1. **Deferred chunks flush** (line ~118): Checks `json.type !== "result"` to decide if resume succeeded. For Codex, all events pass this check, so deferred chunks would flush immediately — even on failure.

2. **Close handler** (line ~164): Checks `json.type === "result" && json.is_error === true` to detect resume failure. Codex emits `turn.failed` or `error` instead.

**Fix:** Pass the `model` parameter through to `spawn()` (it already receives it) and generalize the resume-error detection:

```ts
function isResumeError(json: Record<string, unknown>, model: AgentModel): boolean {
  // Claude/Gemini: result event with error flag
  if (json.type === "result" && json.is_error === true) return true;
  // Codex: turn.failed or stream-level error
  if (model === "codex" && (json.type === "turn.failed" || json.type === "error")) return true;
  return false;
}
```

The deferred chunks check becomes `json.type !== "result"` for Claude/Gemini, or for Codex: flush on `item.started`/`item.completed`/`turn.started` (signals that the session is alive), but defer on `error`/`turn.failed`.

## 4. UI Changes

### ModelIcon.tsx
Add to `iconPaths` record:
```ts
codex: "/agent-icons/codex-color.svg",
```

### SettingsDialog.tsx
Extend model picker array:
```ts
{(["claude", "gemini", "codex"] as const).map((m) => (
```

### MessageInput.tsx
Replace hardcoded ternary at line 226 with the `ModelIcon` component, which already handles icon resolution for all models and supports custom agent icons.

## 5. Default Agent Color

Codex: `#10a37f` (OpenAI green)

## Non-Goals

- No Codex-specific configuration UI (model selection via `-m`, config overrides)
- No special handling for `reasoning`, `todo_list`, or `web_search` items (can be added later)
- No provider abstraction / plugin system (YAGNI for 3 agents)
