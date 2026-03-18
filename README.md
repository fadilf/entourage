<p align="center">
  <img src="public/logo-light.svg" alt="Entourage" width="128" />
</p>

# Entourage

A multi-agent coding tool with a unified chat UI. Entourage spawns CLI subprocesses (Claude CLI, Gemini CLI) against a local project directory, letting you run real-time streaming conversations with multiple AI agents side by side.

Create custom agent profiles with distinct names, icons, colors, and personality system prompts. Use @mentions to route messages to specific agents within a thread.

## Features

- **Multi-agent chat** — Talk to Claude, Gemini, or custom agents in the same thread
- **Custom agent profiles** — Configure names, icons, colors, and system prompts
- **@mentions** — Route messages to specific agents
- **Image attachments** — Send images to vision-capable agents
- **Thread management** — Create, rename, archive, and organize conversations
- **Real-time streaming** — SSE-based streaming with live response rendering
- **Workspace management** — Add local project directories and switch between them
- **Voice input** — Dictate messages using the Web Speech API

## Getting Started

### Prerequisites

- Node.js 18+
- At least one CLI installed: [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) or [Gemini CLI](https://github.com/google-gemini/gemini-cli)

### Quick Start

```bash
cd ~/my-project
npx @fadilf/entourage
```

Open [http://localhost:5555](http://localhost:5555) to start chatting.

#### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--port`, `-p` | Port to serve on | `5555` |
| `--host`, `-H` | Host to bind to | `localhost` |

```bash
npx @fadilf/entourage -p 8080              # custom port
npx @fadilf/entourage -H 0.0.0.0           # expose to network
npx @fadilf/entourage -H 0.0.0.0 -p 8080  # both
```

### Development

```bash
npm install
npm run dev
```

## Stack

Next.js (App Router), React, TypeScript, Tailwind CSS

## License

MIT
