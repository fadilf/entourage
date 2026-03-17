# Conversation Rewind Design

## Summary

Add a "Rewind to here" context menu action on messages that truncates the conversation to that point, permanently deleting all subsequent messages. After rewinding, CLI subprocesses are killed and the next message starts a fresh session with conversation context injected via `buildContextualPrompt()`.

## Requirements

- Right-click a message to get a "Rewind to here" context menu
- The clicked message is kept; everything after it is permanently deleted
- Only available when no agents are actively streaming
- Works identically for all agent types (Claude, Gemini)
- Confirmation dialog before executing

## Approach: Kill & Restart Fresh

On rewind: truncate the message array in the thread JSON, kill all running processes for the thread, and clear those agents from `usedSessions`. The next message spawns a fresh CLI session. `buildContextualPrompt()` already injects prior conversation context into the prompt, so the agent gets the remaining history as context.

**Trade-off:** The agent loses its internal CLI session memory after rewind. This is acceptable because prompt enrichment already handles this case (it's the same mechanism used when agents "miss" messages in multi-agent threads).

## Architecture

### Data Flow

```
User right-clicks message -> Context menu -> "Rewind to here" -> Confirm dialog
  |
  v
POST /api/threads/{threadId}/rewind   { messageId: string }
  |
  v
API route:
  1. resolveWorkspaceDir(request)
  2. ProcessManager.isThreadStreaming(threadId) -> if true, return 409
  3. ProcessManager.killByThread(threadId) -- kill processes, clear usedSessions
  4. threadStore.truncateAfterMessage(workspaceDir, threadId, messageId)
  5. Return truncated ThreadWithMessages
  |
  v
UI:
  1. Replace local thread state with response
  2. Messages after rewind point disappear
  |
  v
Next user message:
  1. ProcessManager.spawn() -- no existing session, starts fresh with --session-id
  2. buildContextualPrompt() injects remaining conversation history
  3. Agent responds with full context of prior messages
```

### Backend

#### New API endpoint: `POST /api/threads/[threadId]/rewind/route.ts`

Uses the flat-action route convention consistent with existing endpoints (`/stream`, `/stop`).

- Resolves workspace dir via `resolveWorkspaceDir(request)` (same as all other routes)
- Reads `messageId` from request body
- Loads the thread, finds the index of `messageId`
- Checks `ProcessManager.isThreadStreaming(threadId)` -- returns 409 Conflict if true
- Calls `ProcessManager.killByThread(threadId)` to kill processes and clear session state
- Calls `truncateAfterMessage(workspaceDir, threadId, messageId)` to truncate and persist
- Returns the truncated `ThreadWithMessages`

#### Thread Store: `truncateAfterMessage()` in `src/lib/thread-store.ts`

- Finds the message index by ID
- Slices `messages` array to keep everything up to and including that index
- Marks any remaining messages with `status: "streaming"` as `status: "error"` (handles stale streaming state)
- Updates `updatedAt` timestamp
- Writes back using the existing per-thread write lock

#### ProcessManager changes in `src/lib/process-manager.ts`

Two new methods:

- `killByThread(threadId: string)`: Iterates the process map, kills all entries where `entry.threadId === threadId`, removes them from the map, and clears their session IDs from `usedSessions` using `getSessionId(entry.threadId, entry.agentId)`. Must clear from `usedSessions` **before** killing the process to avoid the close handler re-adding the session ID.
- `isThreadStreaming(threadId: string): boolean`: Returns true if any process for the given thread has status `"running"`

**Session resume after rewind:** After `killByThread` clears `usedSessions`, the `hasHistory` check in `spawn()` will still detect prior assistant messages and set `isResume = true`, causing a `--resume` attempt on a dead session. The existing retry fallback (which detects empty output and restarts with fresh `--session-id`) handles this transparently. This adds one wasted subprocess spawn on the first post-rewind message — acceptable latency for a rare operation.

### Frontend

#### Shared ContextMenu component

Extract the existing `ContextMenu` component from `ThreadList.tsx` into `src/components/ContextMenu.tsx` for reuse. The existing component already follows the right styling pattern (fixed z-50, white/zinc background, border, shadow).

#### Context Menu on messages

- Attach `onContextMenu` handler at the `MessageGroup` level in `MessageList.tsx` to avoid prop-drilling through `MessageBubble`
- Single item: "Rewind to here" with `RotateCcw` icon from lucide-react
- Hidden/disabled when any agent is currently streaming (checked via `streamingMessages` map)
- Pass `onRewind(messageId)` callback from `ThreadDetail` -> `MessageList`

#### Confirmation Dialog

- "Are you sure? Messages after this point will be permanently deleted."
- Confirm / Cancel buttons
- Styled as existing modal pattern: `fixed inset-0 z-50 bg-black/40` overlay

#### ThreadDetail Integration

- Wire up the rewind API call on confirm
- On success, update local `selectedThread` state with the response
- Messages after the rewind point disappear immediately

## Files Touched

| File | Change |
|------|--------|
| `src/lib/process-manager.ts` | Add `killByThread()`, `isThreadStreaming()` |
| `src/lib/thread-store.ts` | Add `truncateAfterMessage()` |
| `src/app/api/threads/[threadId]/rewind/route.ts` | New POST endpoint |
| `src/components/ContextMenu.tsx` | Extract shared component from ThreadList |
| `src/components/ThreadList.tsx` | Import shared ContextMenu instead of local definition |
| `src/components/MessageList.tsx` | Context menu on message groups, `onRewind` prop |
| `src/components/ThreadDetail.tsx` | Wire up rewind call and state update |

## Error Handling

- **409 Conflict**: Returned if agents are streaming. UI should show a brief toast/message: "Can't rewind while agents are responding."
- **404 Not Found**: If thread or message ID doesn't exist.
- **Network errors**: Standard fetch error handling in the UI.

## Limitations

- After rewinding, the CLI agent loses its internal session memory. The prompt enrichment partially compensates but doesn't fully replicate CLI session semantics (e.g., tool call history, multi-turn reasoning chains internal to the CLI).
- No undo for the rewind itself -- once confirmed, deleted messages are gone permanently.
- First message after rewind incurs one extra subprocess spawn due to the `--resume` retry fallback. This is a minor latency cost for a rare operation.
