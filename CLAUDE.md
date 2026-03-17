# CLAUDE.md

## Commands

- `npm run dev` — Start dev server (Next.js, port 5555)
- `npm run build` — Production build
- `npm run lint` — ESLint (flat config, next/core-web-vitals + typescript)

No test framework is configured.

## Architecture

Entourage is a multi-agent coding tool that spawns CLI subprocesses (Claude CLI, Gemini CLI) against a local project directory, with a unified chat UI for real-time streaming conversations. Users can create custom agent profiles with distinct names, icons, colors, and personality system prompts.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, lucide-react icons

**Path alias:** `@/*` → `./src/*`

### Data flow

```
Browser → API Routes → ProcessManager (singleton) → CLI subprocesses (claude, gemini)
                      → ThreadStore → .entourage/threads/*.json
                      → AgentStore  → .entourage/config.json
                      → WorkspaceStore → ~/.entourage/workspaces.json
```

### Key patterns

- **File-based persistence** with per-thread write locks (`Map<string, Promise>`)
- **ProcessManager** is a `globalThis` singleton (survives HMR), keyed by `${threadId}:${agentId}`
- **Startup recovery:** `getThread()` marks stale `status: "streaming"` messages as `error`
- **Agent personality:** Claude uses `--append-system-prompt`, Gemini prepends `[System Instructions]` to prompt
- **SSE streaming** via POST fetch + ReadableStream reader (`useAgentStream` hook)
- **@mentions** parsed to route messages to specific agents; falls back to first agent
- **Workspaces** map to local project directories; resolved via `?workspaceId` query param
- **Voice input** via Web Speech API (`useVoiceInput` hook) with interim text and auto-restart

### Design conventions

- Light theme: white bg, zinc-900 text, violet-600 for user messages
- Agent avatars: white circle with colored border, model SVG or custom icon inside
- Fonts: Geist Sans + Geist Mono via `next/font/google`
- Modals: `fixed inset-0 z-50 bg-black/40` overlay
