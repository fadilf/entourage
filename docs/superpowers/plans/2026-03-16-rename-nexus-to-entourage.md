# Rename Nexus → Entourage Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the project from "Nexus" to "Entourage" across all code, config, and docs, with automatic migration of existing `.nexus/` data.

**Architecture:** Add a `migrateFromNexus()` utility in `config.ts` that atomically renames `.nexus/` → `.entourage/`. Wire it into `ensureEntourageDir()` so migration runs before any data access. Then do a mechanical find-and-replace across constants, env vars, localStorage keys, UI strings, and docs.

**Tech Stack:** Node.js `fs/promises` for migration, Next.js App Router, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-16-rename-nexus-to-entourage-design.md`

---

## Chunk 1: Core data layer rename + migration

### Task 1: Rename data layer from Nexus to Entourage

**Files:**
- Modify: `src/lib/config.ts:1-10`
- Modify: `src/lib/thread-store.ts:3,8,12,29-31,34,155`
- Modify: `src/lib/agent-store.ts:5,11,38`
- Modify: `src/lib/workspace-store.ts:1-7,13-17`
- Modify: `src/lib/process-manager.ts:209,216`
- Modify: `src/lib/workspace-context.ts:9`

> **Note:** All data layer changes are committed together so every commit produces a clean build.

- [ ] **Step 1: Add migration function and rename NEXUS_DIR to ENTOURAGE_DIR**

Replace the top of `config.ts` with:

```typescript
import path from "path";
import { rename, access } from "fs/promises";
import { Agent } from "./types";

export const ENTOURAGE_DIR = ".entourage";
export const THREADS_DIR = "threads";
export const UPLOADS_DIR = "uploads";

export async function migrateFromNexus(baseDir: string): Promise<void> {
  const oldDir = path.join(baseDir, ".nexus");
  const newDir = path.join(baseDir, ENTOURAGE_DIR);
  try {
    await access(newDir);
    return; // already migrated
  } catch {
    // .entourage doesn't exist, check for .nexus
  }
  try {
    await access(oldDir);
    await rename(oldDir, newDir);
  } catch {
    // neither exists or already moved by another process — nothing to do
  }
}

export function getUploadsDir(workspaceDir?: string): string {
  return path.join(workspaceDir || process.cwd(), ENTOURAGE_DIR, UPLOADS_DIR);
}
```

- [ ] **Step 2: Update thread-store.ts imports and rename ensureNexusDir**

Replace:
```typescript
import { NEXUS_DIR, THREADS_DIR } from "./config";
```
With:
```typescript
import { ENTOURAGE_DIR, THREADS_DIR, migrateFromNexus } from "./config";
```

Replace:
```typescript
function getWorkingDirectory(): string {
  return process.env.NEXUS_PROJECT_DIR || process.cwd();
}
```
With:
```typescript
function getWorkingDirectory(): string {
  return process.env.ENTOURAGE_PROJECT_DIR || process.cwd();
}
```

Replace:
```typescript
function getThreadsDir(workspaceDir: string): string {
  return path.join(workspaceDir, NEXUS_DIR, THREADS_DIR);
}
```
With:
```typescript
function getThreadsDir(workspaceDir: string): string {
  return path.join(workspaceDir, ENTOURAGE_DIR, THREADS_DIR);
}
```

Replace:
```typescript
export async function ensureNexusDir(workspaceDir: string): Promise<void> {
  await mkdir(getThreadsDir(workspaceDir), { recursive: true });
}
```
With:
```typescript
export async function ensureEntourageDir(workspaceDir: string): Promise<void> {
  await migrateFromNexus(workspaceDir);
  await mkdir(getThreadsDir(workspaceDir), { recursive: true });
}
```

- [ ] **Step 3: Update all calls to ensureNexusDir within thread-store.ts**

In `listThreads` (line 34) and `createThread` (line 155), replace `ensureNexusDir` → `ensureEntourageDir`.

- [ ] **Step 4: Update agent-store.ts import and all usages**

Replace:
```typescript
import { NEXUS_DIR, DEFAULT_AGENTS, DEFAULT_AGENT_IDS } from "./config";
```
With:
```typescript
import { ENTOURAGE_DIR, DEFAULT_AGENTS, DEFAULT_AGENT_IDS } from "./config";
```

Replace all 2 occurrences of `NEXUS_DIR` in the file body with `ENTOURAGE_DIR`:
- Line 11: `return path.join(workspaceDir, NEXUS_DIR, "config.json");`
- Line 38: `const dir = path.join(workspaceDir, NEXUS_DIR);`

- [ ] **Step 5: Update workspace-store.ts file path and add migration**

Replace:
```typescript
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Workspace } from "./types";

const WORKSPACE_FILE = path.join(os.homedir(), ".nexus", "workspaces.json");
```
With:
```typescript
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Workspace } from "./types";
import { migrateFromNexus } from "./config";

const WORKSPACE_FILE = path.join(os.homedir(), ".entourage", "workspaces.json");
```

- [ ] **Step 6: Wire migration into workspace-store loadData()**

Replace:
```typescript
async function loadData(): Promise<WorkspaceData> {
  try {
    const raw = await readFile(WORKSPACE_FILE, "utf-8");
    return JSON.parse(raw) as WorkspaceData;
  } catch {
```
With:
```typescript
async function loadData(): Promise<WorkspaceData> {
  await migrateFromNexus(os.homedir());
  try {
    const raw = await readFile(WORKSPACE_FILE, "utf-8");
    return JSON.parse(raw) as WorkspaceData;
  } catch {
```

- [ ] **Step 7: Update process-manager.ts**

Replace:
```typescript
const globalKey = Symbol.for("nexus-process-manager");
```
With:
```typescript
const globalKey = Symbol.for("entourage-process-manager");
```

Replace:
```typescript
      const workspaceDir = process.env.NEXUS_PROJECT_DIR || process.cwd();
```
With:
```typescript
      const workspaceDir = process.env.ENTOURAGE_PROJECT_DIR || process.cwd();
```

- [ ] **Step 8: Update workspace-context.ts**

Replace:
```typescript
  return process.env.NEXUS_PROJECT_DIR || process.cwd();
```
With:
```typescript
  return process.env.ENTOURAGE_PROJECT_DIR || process.cwd();
```

- [ ] **Step 9: Verify full build passes**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 10: Verify no remaining references to NEXUS_DIR**

Run: `grep -r "NEXUS_DIR\|ensureNexusDir" src/`
Expected: No matches

- [ ] **Step 11: Commit all data layer changes**

```bash
git add src/lib/config.ts src/lib/thread-store.ts src/lib/agent-store.ts src/lib/workspace-store.ts src/lib/process-manager.ts src/lib/workspace-context.ts
git commit -m "feat: rename Nexus to Entourage across data layer, add .nexus migration"
```

## Chunk 2: UI, metadata, and documentation

### Task 2: Update UI strings and metadata

**Files:**
- Modify: `src/components/ThreadList.tsx:249-250`
- Modify: `src/app/layout.tsx:23,33`
- Modify: `public/manifest.json:2-3`
- Modify: `package.json:2`
- Modify: `src/app/page.tsx:85,95,100,131`

- [ ] **Step 1: Update ThreadList.tsx**

Replace:
```tsx
          <img src="/logo.png" alt="Nexus" className="h-7 w-7" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Nexus</h1>
```
With:
```tsx
          <img src="/logo.png" alt="Entourage" className="h-7 w-7" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Entourage</h1>
```

- [ ] **Step 2: Update layout.tsx**

Replace:
```typescript
  title: "Nexus",
  description: "Thread-based messaging client",
```
With:
```typescript
  title: "Entourage",
  description: "Thread-based messaging client",
```

Replace:
```typescript
    title: "Nexus",
```
With:
```typescript
    title: "Entourage",
```

- [ ] **Step 3: Update manifest.json**

Replace:
```json
  "name": "Nexus",
  "short_name": "Nexus",
```
With:
```json
  "name": "Entourage",
  "short_name": "Entourage",
```

- [ ] **Step 4: Update package.json**

Replace:
```json
  "name": "nexus",
```
With:
```json
  "name": "entourage",
```

- [ ] **Step 5: Update localStorage keys in page.tsx**

Replace all occurrences (use find-and-replace):
- `"nexus-active-workspace"` → `"entourage-active-workspace"` (2 occurrences: lines 85, 95)
- `"nexus-sidebar-width"` → `"entourage-sidebar-width"` (2 occurrences: lines 100, 131)

- [ ] **Step 6: Commit**

```bash
git add src/components/ThreadList.tsx src/app/layout.tsx public/manifest.json package.json src/app/page.tsx
git commit -m "feat: rename all user-facing Nexus strings to Entourage"
```

### Task 3: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add data directory entries**

Add after the `# misc` section:

```
# app data
.nexus
.entourage
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .nexus and .entourage to gitignore"
```

### Task 4: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-03-13-nexus-real-agent-sessions-design.md`
- Modify: `docs/superpowers/specs/2026-03-14-responsive-mobile-design.md`
- Modify: `docs/superpowers/specs/2026-03-15-dark-mode-toggle-design.md`
- Modify: `docs/superpowers/specs/2026-03-15-slack-style-chat-layout-design.md`
- Modify: `docs/superpowers/specs/2026-03-15-voice-typing-design.md`
- Modify: `docs/superpowers/plans/2026-03-15-dark-mode-toggle.md`
- Modify: `docs/superpowers/plans/2026-03-15-background-streaming-resilience.md`

- [ ] **Step 1: Update README.md**

Replace all occurrences of "Nexus" with "Entourage" (display name) and "nexus" with "entourage" (identifiers).

Key replacements:
- `alt="Nexus"` → `alt="Entourage"`
- `# Nexus` → `# Entourage`
- Any description mentioning "Nexus" → "Entourage"

- [ ] **Step 2: Update CLAUDE.md**

Replace throughout:
- `Nexus is a multi-agent coding tool` → `Entourage is a multi-agent coding tool`
- `.nexus/threads/*.json` → `.entourage/threads/*.json`
- `.nexus/config.json` → `.entourage/config.json`
- `~/.nexus/workspaces.json` → `~/.entourage/workspaces.json`
- `NEXUS_PROJECT_DIR` → `ENTOURAGE_PROJECT_DIR`

- [ ] **Step 3: Update ROADMAP.md**

Replace:
- `# Nexus Roadmap` → `# Entourage Roadmap`
- `package Nexus as a native desktop application` → `package Entourage as a native desktop application`

- [ ] **Step 4: Update all docs/superpowers/**/*.md files**

For each file listed above, replace all occurrences of:
- `Nexus` → `Entourage`
- `NEXUS_PROJECT_DIR` → `ENTOURAGE_PROJECT_DIR`
- `.nexus` → `.entourage`

Do NOT modify the rename spec itself (`2026-03-16-rename-nexus-to-entourage-design.md`) — it should reference both names for context.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md ROADMAP.md docs/superpowers/
git commit -m "docs: rename Nexus to Entourage across all documentation"
```

### Task 5: Regenerate package-lock.json and final verification

- [ ] **Step 1: Regenerate lockfile**

Run: `npm install`
Expected: `package-lock.json` updated with `"name": "entourage"`

- [ ] **Step 2: Clean build**

Run: `rm -rf .next && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev` and verify:
- Page title says "Entourage"
- Sidebar header says "Entourage"
- Existing threads load correctly (migration moved `.nexus/` → `.entourage/`)

- [ ] **Step 5: Commit lockfile**

```bash
git add package-lock.json
git commit -m "chore: regenerate package-lock.json after rename"
```
