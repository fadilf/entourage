# Nexus

A multi-agent coding tool with a unified chat UI. Nexus spawns CLI subprocesses (Claude CLI, Gemini CLI) against a local project directory, letting you run real-time streaming conversations with multiple AI agents side by side.

Create custom agent profiles with distinct names, icons, colors, and personality system prompts. Use @mentions to route messages to specific agents within a thread.

## Features

- **Multi-agent chat** — Talk to Claude, Gemini, or custom agents in the same thread
- **Custom agent profiles** — Configure names, icons, colors, and system prompts
- **@mentions** — Route messages to specific agents
- **Image attachments** — Send images to vision-capable agents
- **Thread management** — Create, rename, archive, and organize conversations
- **Real-time streaming** — SSE-based streaming with live response rendering

## Getting Started

### Prerequisites

- Node.js 18+
- At least one CLI installed: [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) or [Gemini CLI](https://github.com/google-gemini/gemini-cli)

### Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start chatting.

### Environment

- `NEXUS_PROJECT_DIR` — Working directory for CLI subprocesses (defaults to `process.cwd()`)

## Stack

Next.js (App Router), React, TypeScript, Tailwind CSS

## License

MIT
