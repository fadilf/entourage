# Nexus: Real Multi-Agent Coding Sessions

## Problem

Nexus is currently a static demo — hardcoded threads with fake messages. The goal is to make it a real, functional alternative for running coding agents (Claude, Gemini) against a local file directory, with a unified chat UI.

## Design Decisions

- **Threads = persistent agent sessions** — ongoing conversations, not one-off tasks
- **Multi-agent threads** — a thread can include both Claude and Gemini
- **@mention routing** — `@claude fix auth` routes to Claude; no mention = last-active agent
- **Subprocess CLIs** — spawn `claude` and `gemini` CLI processes (not direct API calls)
- **Single working directory** — Nexus launches pointed at one project dir
- **Parallel execution** — multiple agents can run simultaneously across threads
- **File-based persistence** — `.nexus/threads/*.json` in the project directory
- **Full auto mode** — no approval gates, agents execute freely
- **MVP scope** — chat + execute only (no file viewer, no terminal panel)

## Architecture

```
Browser (React UI)
  ├── ThreadList (sidebar)
  └── ThreadDetail (messages + input)
        │
        ▼  POST /api/threads/:id/messages
        ▼  POST /api/threads/:id/stream (SSE)
        │
Next.js API Routes (Server)
  ├── ProcessManager (singleton) — spawns/tracks CLI subprocesses
  ├── ThreadStore — file CRUD for .nexus/threads/*.json
  └── CLI subprocesses (claude, gemini) → read/write project files
        │
        ▼
Local filesystem (project directory + .nexus/)
```

## Data Model

```typescript
type AgentModel = "claude" | "gemini";

type Agent = {
  id: string;
  name: string;
  model: AgentModel;
  avatarColor: string;
};

type Thread = {
  id: string;
  title: string;
  agents: Agent[];
  createdAt: string;   // ISO 8601
  updatedAt: string;
};

type Message = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  agentId?: string;     // which agent (assistant messages only)
  content: string;
  timestamp: string;
  status: "streaming" | "complete" | "error";
};

type ThreadProcess = {
  threadId: string;
  agentId: string;
  status: "idle" | "running" | "error";
  pid?: number;
};
```

Each thread is stored as `.nexus/threads/{threadId}.json` containing `{ thread, messages }`.

## CLI Integration

**Claude CLI:**
- `claude -p "prompt" --output-format stream-json --dangerously-skip-permissions --session-id <uuid>`
- Session ID derived deterministically from threadId+agentId for resumability

**Gemini CLI:**
- `gemini -p "prompt" --output-format stream-json --approval-mode yolo`
- Uses `--resume latest` for continuing prior sessions

Both CLIs inherit the working directory from the spawning process and emit newline-delimited JSON via `--output-format stream-json`.

## File Plan

### New files
| File | Purpose |
|------|---------|
| `src/lib/types.ts` | Shared type definitions |
| `src/lib/config.ts` | Constants, default agents, CLI templates |
| `src/lib/thread-store.ts` | File-based CRUD for `.nexus/` |
| `src/lib/process-manager.ts` | Subprocess lifecycle singleton |
| `src/lib/mentions.ts` | @mention parsing utility |
| `src/lib/stream-parser.ts` | CLI stream-json output parser |
| `src/hooks/useSSE.ts` | Client-side SSE consumption hook |
| `src/app/api/threads/route.ts` | GET (list) + POST (create) threads |
| `src/app/api/threads/[threadId]/route.ts` | GET + DELETE single thread |
| `src/app/api/threads/[threadId]/messages/route.ts` | GET + POST messages |
| `src/app/api/threads/[threadId]/stream/route.ts` | POST → SSE streaming |
| `src/app/api/config/route.ts` | GET working dir + available agents |
| `src/app/api/threads/status/route.ts` | GET process statuses |
| `src/components/MessageInput.tsx` | Text input with @mention autocomplete |
| `src/components/NewThreadDialog.tsx` | Thread creation modal |
| `src/components/AgentStatusBadge.tsx` | Running/idle/error indicator |

### Modified files
| File | Changes |
|------|---------|
| `src/app/page.tsx` | Replace static import with API fetching, add streaming integration |
| `src/components/ThreadList.tsx` | New Thread type, status badges, new-thread button |
| `src/components/ThreadDetail.tsx` | New data model (agents not participants), streaming support, add MessageInput |
| `src/components/MessageBubble.tsx` | Add streaming indicator, error styling |
| `src/components/ModelIcon.tsx` | Remove codex from type |

### Deleted files
| File | Reason |
|------|--------|
| `src/data/threads.ts` | Replaced by `src/lib/types.ts` + ThreadStore |

## Reusable Existing Code

- `MessageBubble.renderContent()` — already handles @mention highlighting via `/@\w+/g` regex
- `ModelIcon` — maps AgentModel to SVG paths, reusable as-is
- `MessageBubble` avatar rendering — colored circles with model icons, keep pattern
- `ThreadDetail` layout — header with participant chips + scrollable messages, adapt in place
- `ThreadList` — sidebar structure, adapt props

## Key Implementation Details

### ProcessManager singleton
Uses `globalThis` pattern to survive Next.js hot module reloading in dev. Maps `${threadId}:${agentId}` to `ChildProcess`. Registers cleanup on `process.on('exit')` and `process.on('SIGINT')`.

### Concurrency control
Per-thread in-memory lock (`Map<string, Promise<void>>`) serializes file writes to prevent corruption from parallel agent responses.

### SSE streaming
POST endpoint returns a `ReadableStream`. CLI stdout chunks are parsed, forwarded as SSE events. On client disconnect, the subprocess is NOT killed — it finishes its work and the result is persisted. Content is periodically flushed to disk during streaming.

### Startup recovery
On first `listThreads()` call, scan for messages with `status: "streaming"` and mark them as `status: "error"` with "[Stream interrupted]" appended.

### Error handling
- CLI not installed: `spawn` emits ENOENT → clear error message to user
- Process crash: non-zero exit code → message status set to "error"
- Corrupt JSON files: try/catch on parse, skip in list, return null on get
