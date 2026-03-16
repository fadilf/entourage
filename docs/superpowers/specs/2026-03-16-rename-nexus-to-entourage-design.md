# Rename Nexus → Entourage

## Summary

Rename the project from "Nexus" to "Entourage" across the entire codebase — UI, data directories, env vars, localStorage keys, internal symbols, and documentation. Includes a one-time migration that moves existing `.nexus/` data to `.entourage/` so users keep their chat history, configs, and uploads.

## Decisions

- **Data directory:** `.nexus/` → `.entourage/` with automatic migration on startup
- **Environment variable:** `NEXUS_PROJECT_DIR` → `ENTOURAGE_PROJECT_DIR` (no fallback)
- **localStorage keys:** Renamed (clean break, trivial data loss — sidebar width and active workspace)

## Changes

### 1. Data directory & migration

**Files:** `src/lib/config.ts`, `src/lib/thread-store.ts`, `src/lib/agent-store.ts`, `src/lib/workspace-store.ts`

- Rename constant `NEXUS_DIR = ".nexus"` → `ENTOURAGE_DIR = ".entourage"` in `config.ts`
- Update all imports referencing `NEXUS_DIR` → `ENTOURAGE_DIR`
- Rename `ensureNexusDir()` → `ensureEntourageDir()` in `thread-store.ts`
- Add migration function in `config.ts`:
  - On first access, if `.entourage/` doesn't exist but `.nexus/` does → `fs.rename()` (atomic move)
  - Same logic for `~/.nexus/workspaces.json` → `~/.entourage/workspaces.json` in `workspace-store.ts`
- Update `.gitignore`: `.nexus` → `.entourage`

### 2. Environment variable

**Files:** `src/lib/process-manager.ts`, `src/lib/thread-store.ts`, `src/lib/workspace-context.ts`

- All references to `process.env.NEXUS_PROJECT_DIR` → `process.env.ENTOURAGE_PROJECT_DIR`
- No backwards-compatibility fallback

### 3. localStorage keys

**File:** `src/app/page.tsx`

- `nexus-active-workspace` → `entourage-active-workspace`
- `nexus-sidebar-width` → `entourage-sidebar-width`

### 4. UI strings & metadata

**Files:** `src/components/ThreadList.tsx`, `src/app/layout.tsx`, `public/manifest.json`, `package.json`

- All user-visible "Nexus" text → "Entourage"
- `package.json` name field: `"nexus"` → `"entourage"`
- `manifest.json` name/short_name: `"Nexus"` → `"Entourage"`
- `layout.tsx` title and openGraph title: `"Nexus"` → `"Entourage"`
- `ThreadList.tsx` alt text and heading: `"Nexus"` → `"Entourage"`

### 5. Internal symbols

**File:** `src/lib/process-manager.ts`

- `Symbol.for("nexus-process-manager")` → `Symbol.for("entourage-process-manager")`

### 6. Documentation

**Files:** `README.md`, `CLAUDE.md`, `ROADMAP.md`, `docs/superpowers/specs/*.md`

- All references to "Nexus" → "Entourage"
- Update data flow diagram in `CLAUDE.md` (`.nexus/` paths → `.entourage/`)
- Update env var reference in `CLAUDE.md`

## Out of scope

- **Repo folder name** (`/Users/fadil/Code/nexus`) — user handles this outside git
- **Logo redesign** — separate effort, tracked in a different conversation
- **Git remote/repo name** — user handles this on GitHub

## Migration details

The migration is intentionally simple:

```typescript
import fs from "fs/promises";
import path from "path";

export async function migrateFromNexus(baseDir: string): Promise<void> {
  const oldDir = path.join(baseDir, ".nexus");
  const newDir = path.join(baseDir, ".entourage");
  try {
    await fs.access(newDir);
    return; // already migrated
  } catch {
    // .entourage doesn't exist, check for .nexus
  }
  try {
    await fs.access(oldDir);
    await fs.rename(oldDir, newDir);
  } catch {
    // neither exists, nothing to migrate
  }
}
```

This runs once per workspace directory and once for the home directory (`~/.nexus` → `~/.entourage`). The `fs.rename` call is atomic on the same filesystem.

## Risk

- If a user has `.nexus/` on a different filesystem mount than the target, `fs.rename` will fail. This is an edge case for a local dev tool and can be ignored.
- The env var rename is a breaking change. Users with `NEXUS_PROJECT_DIR` set must update their shell profile. This is acceptable since the project is early-stage.
