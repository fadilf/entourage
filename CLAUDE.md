# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server (Next.js, port 3000)
- `npm run build` — Production build
- `npm run lint` — ESLint (flat config, next/core-web-vitals + typescript)

No test framework is configured.

## Architecture

Nexus is a thread-based messaging UI where a human user communicates with AI agents (Claude, Gemini, Codex). Currently static/demo data — no backend.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4

**Path alias:** `@/*` maps to `./src/*`

### Key files

- `src/data/threads.ts` — Type definitions (`Thread`, `Message`, `User`, `AgentModel`) and static thread data. `ME` is the human user; agents have a `model` field.
- `src/app/page.tsx` — Client component. Manages selected thread state, renders `ThreadList` + `ThreadDetail` side-by-side.
- `src/components/ThreadList.tsx` — Sidebar showing threads with participant avatars, last message preview, message count.
- `src/components/ThreadDetail.tsx` — Header with participant chips + scrollable message list. Uses `resolveUser()` to map `senderId` → `User`.
- `src/components/MessageBubble.tsx` — Chat bubble. Own messages align right (violet), agent messages align left (zinc). Shows model icon for agents.
- `src/components/ModelIcon.tsx` — Renders agent logo SVGs from `/public/agent-icons/`.

### Design conventions

- Dark theme: zinc-950 background, zinc-100 text, violet-600 for user's own messages
- Agent avatars: white circle with colored border/inner shadow per agent, model SVG icon inside
- Fonts: Geist Sans + Geist Mono via `next/font/google`
