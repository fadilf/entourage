# Background Streaming Resilience

**Date:** 2026-03-15
**Status:** Draft

## Problem

When a user sends a message and navigates away (switches threads, reloads the page, or closes and reopens the tab), the streaming response is lost or marked as an error. The user expects to come back and either see the completed message or see that it's still streaming.

## Goals

1. Streaming continues in the background regardless of client state
2. Returning to a thread re-attaches to an active stream or shows the completed message
3. Sidebar indicates which threads have new activity (pulsing dot for streaming, solid dot for unread completed)
4. Works across in-app navigation, full page reloads, and tab close/reopen

## Design

### Section 1: Server-Side Recovery Fix

**Current bugs:**

1. `getThread()` in `thread-store.ts` marks any message with `status: "streaming"` as `"error"` on read. This is stale-process recovery logic, but it incorrectly marks messages for processes that are still alive.
2. `getThread()` is called by `addMessage()`, `updateThreadTitle()`, `archiveThread()`, and `addAgentsToThread()` — meaning any write to a thread corrupts concurrent streams by marking their in-progress messages as "error".
3. `getThread()` writes back to the file without holding the per-thread write lock, creating a race condition with `updateMessage()` (which does use `withLock()`).

**Changes:**

- **`thread-store.ts` — split `getThread()` into read-only and recovery paths:**
  - `getThread()` becomes purely read-only — it reads from disk but does NOT mark or write back.
  - New `recoverStaleStreams(threadId)` function marks streaming messages as "error" after checking `ProcessManager.getProcess(threadId, agentId)`. If the process is alive, the status is left as `"streaming"`. This function uses `withLock()` to prevent race conditions.
  - **Startup mechanism:** `recoverStaleStreams()` is called during `ProcessManager` singleton initialization (the `globalThis` block in `process-manager.ts`), which runs once on first import. This piggybacks on the existing singleton pattern and ensures recovery runs before any API requests are handled.
  - **New dependency:** `thread-store.ts` will import from `process-manager.ts` (one-way). No circular dependency exists — `process-manager.ts` does not import from `thread-store.ts`.
- **Existing `GET /api/threads/status` endpoint:** Already returns `pm.getAllStatuses()` and is polled by `page.tsx` every 2.5 seconds. Extend this to include `unreadAgents` per thread so the sidebar can derive both streaming and unread state without additional requests. No new per-thread status endpoint needed.

### Section 2: Client Re-attach on Page Load

**On initial page load or hard refresh:**

1. Client fetches the thread (as it does today).
2. If any messages have `status: "streaming"`, the client calls the existing `POST /api/threads/{threadId}/stream` endpoint for each streaming agent.
3. Re-attach request body: `{ agentId, prompt: "" }`. The stream route's existing re-attach code path short-circuits before using `prompt`, so an empty string is safe.
4. The stream route detects the process is alive via `ProcessManager.getProcess()`, returns buffered output, and pipes new output (this already works).
5. `useAgentStream` picks up the stream and renders the message as actively streaming.

**On switching threads within the app (no page reload):**

- The `allStreams` ref in `useAgentStream` keeps SSE connections alive across thread switches. However, `onStreamComplete` currently only calls `refetchThread()` when the completed thread is the selected thread. Fix: when a stream completes for a non-selected thread, also PATCH `unreadAgents` on the server and trigger a sidebar refresh so the unread dot appears.

**Key change:** The client must detect `status: "streaming"` messages when loading a thread and auto-initiate re-attach. Currently it only streams when the user explicitly sends a message.

**Buffer vs. persisted content:** `ProcessManager` caps its buffer at 100 chunks, which may not cover the full response for long-running streams. On re-attach, the stream route sends the persisted message content from disk as the first event, then replays the buffer, then pipes live output.

**Re-attach SSE event format:** The stream route uses a distinct `initial` event type for the persisted content, followed by regular `content` events for buffer and live chunks:

```
data: {"type": "initial", "content": "...full persisted text..."}   ← client sets (not appends)
data: {"type": "content", "text": "...chunk..."}                    ← client appends
data: {"type": "content", "text": "...chunk..."}                    ← client appends
data: {"type": "done", "status": "complete"}                        ← stream finished
```

The client handles `initial` by replacing the message content entirely (not appending), which avoids double-counting content that overlaps with the buffer.

### Section 3: Unread Tracking

**Server-side:**

- Add an `unreadAgents` field to the thread JSON: an array of agent IDs whose messages completed while no client was listening.
- **Detecting "client gone":** Track SSE connection state via `request.signal` (AbortSignal). When the request is aborted (client disconnected), set a flag. On stream completion (`onClose` of the process), if the abort flag is set, add the agent's ID to `unreadAgents`. Also register a `cancel()` handler on the ReadableStream for cleanup.
- When a stream completes in the API route and the client is gone, add that agent's ID to `unreadAgents`.
- Extend the existing `PATCH /api/threads/{threadId}` handler to support clearing `unreadAgents` when the client opens the thread.

**Client-side:**

- Thread list fetches include `unreadAgents` for each thread (via the existing `/api/threads/status` polling or thread list endpoint).
- Sidebar shows:
  - **Pulsing dot** — thread has messages with `status: "streaming"` (process still active)
  - **Solid dot** — thread has entries in `unreadAgents` (completed while you were away)
- When user opens a thread, client sends a PATCH to clear `unreadAgents`.

**Why server-side tracking?** Survives page reloads and tab closes. localStorage would lose state if the user clears browser data or uses a different tab.

### Section 4: Client-Side Changes

**ThreadDetail component:**

- On mount (or when `selectedThreadId` changes), check if any messages have `status: "streaming"`.
- If so, automatically call the stream endpoint to re-attach.
- On re-attach, show a brief "Reconnecting..." state on the message bubble while the re-attach handshake happens.

**ThreadList component (sidebar):**

- Each thread item checks two things:
  - Does the thread have any messages with `status: "streaming"`? → pulsing dot
  - Does the thread have `unreadAgents.length > 0`? → solid dot
- Pulsing dot takes precedence over solid dot (if both apply, show pulsing).
- Dots appear next to the thread name, using the agent's color if single agent, or a neutral accent color if multiple.

**useAgentStream hook:**

- Add a `reattach(threadId, agentId)` function that internally calls the existing `streamAgent()` with `prompt: ""`. It reuses the same streaming infrastructure but skips creating a new streaming message entry (since one already exists on disk). Added to the hook's return value alongside `sendMessage` and `stopAgent`.
- AbortController management: `reattach()` stores its AbortController keyed by `threadId:agentId`. If the user switches away before re-attach completes, abort the re-attach request.
- On `onStreamComplete`, if the completed thread is not the currently selected thread, update that thread's `unreadAgents` on the server via PATCH and trigger a sidebar refresh.

**Page load flow:**

1. Fetch thread list → render sidebar with dots
2. Fetch selected thread → detect streaming messages → auto re-attach
3. Clear `unreadAgents` for the selected thread

## Data Flow

```
Page Load / Thread Switch
  ├─ GET /api/threads → thread list with unreadAgents
  ├─ GET /api/threads/{id} → thread with message statuses (read-only, no side effects)
  ├─ If streaming messages found:
  │   └─ POST /api/threads/{id}/stream { agentId, prompt: "" } (re-attach per agent)
  │       └─ ProcessManager.getProcess() → persisted content + buffer + pipe
  └─ PATCH /api/threads/{id} → clear unreadAgents

Stream Completion (server-side)
  ├─ updateMessage(status: "complete")
  ├─ If request.signal.aborted (client gone):
  │   └─ Add agentId to thread's unreadAgents
  └─ Send done event (if client still connected)

App Startup
  └─ recoverStaleStreams() for all threads
      └─ Checks ProcessManager per agent, marks truly stale streams as "error"
```

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/thread-store.ts` | Split `getThread()` into read-only + `recoverStaleStreams()`; add `unreadAgents` field support; use `withLock()` in recovery path |
| `src/lib/types.ts` | Add `unreadAgents?: string[]` to `Thread`, `ThreadWithMessages`, and `ThreadListItem` types |
| `src/lib/process-manager.ts` | No changes needed (already supports `getProcess()`) |
| `src/app/api/threads/[threadId]/stream/route.ts` | On stream complete with aborted request, write `unreadAgents`; send persisted content before buffer on re-attach |
| `src/app/api/threads/[threadId]/route.ts` | Extend PATCH to support clearing `unreadAgents` |
| `src/app/api/threads/route.ts` | Ensure `listThreads()` response includes `unreadAgents` |
| `src/app/api/threads/status/route.ts` | Extend to include `unreadAgents` per thread |
| `src/hooks/useSSE.ts` | Add `reattach()` function with AbortController management |
| `src/app/page.tsx` | Auto re-attach on thread load; clear unread on thread select; handle `onStreamComplete` for non-selected threads |
| `src/components/ThreadDetail.tsx` | Show "Reconnecting..." state during re-attach |
| `src/components/ThreadList.tsx` | Render pulsing/solid dots based on streaming/unread state |

## Edge Cases

- **Process crashes while client is away:** `recoverStaleStreams()` marks as "error" (ProcessManager has no entry). No re-attach attempted. User sees error state.
- **Multiple agents streaming:** Each agent tracked independently. Re-attach happens per agent. Unread tracks per agent.
- **Rapid thread switching:** AbortController on re-attach requests prevents stale responses. Re-attach stores controllers keyed by `threadId:agentId` and aborts on thread switch.
- **Thread deleted while streaming:** Process cleanup via existing stop endpoint. Thread removal cleans up naturally.
- **Concurrent agent streaming + user sends message:** `getThread()` is now read-only, so `addMessage()` no longer corrupts in-progress streaming messages from other agents.
- **Long-running responses exceeding buffer:** Re-attach sends persisted content via `initial` event, then appends buffer and live stream. No content loss.
- **In-app navigation unread tracking:** Both server-side and client-side paths can write `unreadAgents` — the server writes it if `request.signal.aborted`, and the client writes it via PATCH if still connected but on a different thread. The PATCH to clear `unreadAgents` on thread open handles any duplicates gracefully.
- **`getThread()` race conditions eliminated:** Recovery logic moved to `recoverStaleStreams()` with `withLock()`. Read path is side-effect-free.
