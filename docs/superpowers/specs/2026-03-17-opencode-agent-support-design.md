# OpenCode Agent Support

**Date:** 2026-03-17
**Status:** Approved

## Summary

Add OpenCode as a CLI agent alongside Claude, Gemini, and Codex. Uses `opencode run [message] --format json` for JSONL streaming output, following the established agent integration pattern.

## Architecture

### Type & Config

- Extend `AgentModel` union with `"opencode"`
- Add `"opencode"` to `DEFAULT_AGENT_IDS` array (prevents users from deleting the default)
- Add default agent entry: id `"opencode"`, name `"OpenCode"`, color `#6366f1` (indigo), `isDefault: true`
- Existing auto-merge logic in `agent-store.ts` handles propagation to existing configs

### CLI Command Construction

`getCliCommand()` adds an OpenCode branch **before** the Gemini fallthrough (Gemini is currently the implicit else at the end of the function):

```typescript
if (model === "opencode") {
  let effectivePrompt = fullPrompt;
  if (personality) {
    effectivePrompt = `[System Instructions]\n${personality}\n[End System Instructions]\n\n${effectivePrompt}`;
  }
  const args = ["run", "--format", "json"];
  if (isResume) args.push("--session", sessionId);
  if (hasImages) {
    for (const p of imagePaths) args.push("-f", p);
  }
  args.push(effectivePrompt);
  return { cmd: "opencode", args };
}
```

- Personality via prompt prefix (like Gemini/Codex)
- Resume via `--session <sessionId>` (using OpenCode-generated `ses_*` ID, not our hash)
- File attachment via `-f` flag
- No `--dir` needed — `cwd` set at spawn time

### Stream Parser

OpenCode emits JSONL with these event types:

| OpenCode Event | Maps To | Details |
|---|---|---|
| `step_start` | (internal) | Capture `sessionID` for resume |
| `text` | text StreamEvent | `part.text` has content |
| `tool_use` | tool_start + tool_result | See below |
| `step_finish` | done (when `reason: "stop"`) | Ignore when `reason: "tool-calls"` |

Add `createOpenCodeEventExtractor()` following the Codex extractor pattern.

**Tool event handling:** OpenCode sends `tool_use` events with `part.state.status`. When `status: "completed"`, emit both `tool_start` and `tool_result` together (input from `part.state.input` serialized via `JSON.stringify()`, output from `part.state.output`). If a future OpenCode version sends in-progress tool events, emit only `tool_start` on first sight and `tool_result` when completed.

**Non-JSON lines:** Drop non-JSON lines silently (matching Codex/Gemini behavior). OpenCode may emit migration messages or stack traces to stdout.

### Process Manager

**Session ID storage:**
Use a dedicated `openCodeSessions: Map<string, string>` in `ProcessManager` (not `sessionOverrides`, which is used for rewind). Capture `sessionID` from the first JSONL event and store keyed by `${threadId}:${agentId}`. Modify `getSessionId()` to return the stored OpenCode session ID when model is `"opencode"`.

**Resume handling:**
- `isResumeError()` — add OpenCode branch. OpenCode outputs a `NotFoundError` stack trace (non-JSON) on invalid session. Detect by checking if the process exits without emitting any valid JSON events, or if raw output contains `NotFoundError`.
- `hasSuccessSignal()` — add OpenCode branch: `step_start` or `text` event types indicate success.

**Resume retry path:**
When resume fails for OpenCode, the retry must start a completely new session — call `getCliCommand()` with `isResume: false` and no `--session` flag. This differs from Claude/Gemini/Codex where the retry reuses the same session ID with `isResume: false`.

### UI

- `ModelIcon.tsx` — add `opencode: "/agent-icons/opencode.svg"` to icon paths
- `SettingsDialog.tsx` — add `"opencode"` to model selector array
- New SVG icon at `public/agent-icons/opencode.svg`

## Files Changed

| File | Change |
|---|---|
| `src/lib/types.ts` | Add `"opencode"` to `AgentModel` union |
| `src/lib/config.ts` | Add `"opencode"` to `DEFAULT_AGENT_IDS`, add default agent, add `getCliCommand()` branch (before Gemini fallthrough) |
| `src/lib/stream-parser.ts` | Add `createOpenCodeEventExtractor()` + parser branch, drop non-JSON lines |
| `src/lib/process-manager.ts` | Add `openCodeSessions` map, `isResumeError()` / `hasSuccessSignal()` branches, resume retry path |
| `src/components/ModelIcon.tsx` | Add icon path |
| `src/components/SettingsDialog.tsx` | Add to model selector |
| `public/agent-icons/opencode.svg` | New OpenCode icon |

## Approach

Direct CLI integration via `opencode run --format json`. Chosen over server-attach mode (`opencode serve` + `--attach`) and direct HTTP API for simplicity and consistency with existing agent patterns.
