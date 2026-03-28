# Thread Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-text search to the sidebar that searches thread titles and message content, displaying results inline with matching snippets.

**Architecture:** New `searchThreads` function in thread-store scans all thread JSON files with case-insensitive matching. New GET `/api/threads/search` endpoint exposes it. `ThreadList` component gains a search input that debounces queries, fetches results, and replaces the thread list with search results showing match snippets.

**Tech Stack:** Next.js API routes, TypeScript, React state, lucide-react icons, Vitest

---

### Task 1: Add `ThreadSearchResult` type

**Files:**
- Modify: `src/lib/types.ts:105-108`

- [ ] **Step 1: Add the ThreadSearchResult type**

Add after the `ThreadListItem` type (line 108):

```ts
export type ThreadSearchResult = ThreadListItem & {
  matchSnippet: string;
  matchSource: "title" | "message";
};
```

- [ ] **Step 2: Verify the build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add ThreadSearchResult type"
```

---

### Task 2: Add `searchThreads` function to thread-store

**Files:**
- Modify: `src/lib/thread-store.ts`
- Test: `src/lib/__tests__/thread-store.test.ts`

- [ ] **Step 1: Write failing tests for searchThreads**

Add to `src/lib/__tests__/thread-store.test.ts`. Add `searchThreads` to the import at the top of the file.

```ts
describe("searchThreads", () => {
  it("matches thread title", async () => {
    await createThread(workspaceDir, "Deploy Pipeline", agents);
    await createThread(workspaceDir, "Bug Fix", agents);

    const results = await searchThreads(workspaceDir, "deploy");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Deploy Pipeline");
    expect(results[0].matchSource).toBe("title");
    expect(results[0].matchSnippet).toBe("Deploy Pipeline");
  });

  it("matches message content", async () => {
    const thread = await createThread(workspaceDir, "Chat", agents);
    await addMessage(workspaceDir, thread.id, {
      role: "user",
      content: "How do I configure the database connection?",
      timestamp: new Date().toISOString(),
      status: "complete",
    });

    const results = await searchThreads(workspaceDir, "database");
    expect(results).toHaveLength(1);
    expect(results[0].matchSource).toBe("message");
    expect(results[0].matchSnippet).toContain("database");
  });

  it("is case-insensitive", async () => {
    const thread = await createThread(workspaceDir, "Chat", agents);
    await addMessage(workspaceDir, thread.id, {
      role: "user",
      content: "Check the README file",
      timestamp: new Date().toISOString(),
      status: "complete",
    });

    const results = await searchThreads(workspaceDir, "readme");
    expect(results).toHaveLength(1);
  });

  it("prefers message snippet when both title and message match", async () => {
    const thread = await createThread(workspaceDir, "Database Setup", agents);
    await addMessage(workspaceDir, thread.id, {
      role: "user",
      content: "The database connection string is in .env",
      timestamp: new Date().toISOString(),
      status: "complete",
    });

    const results = await searchThreads(workspaceDir, "database");
    expect(results).toHaveLength(1);
    expect(results[0].matchSource).toBe("message");
  });

  it("returns empty array when no matches", async () => {
    await createThread(workspaceDir, "Chat", agents);
    const results = await searchThreads(workspaceDir, "nonexistent");
    expect(results).toHaveLength(0);
  });

  it("returns results sorted by updatedAt descending", async () => {
    const t1 = await createThread(workspaceDir, "Alpha search term", agents);
    await new Promise((r) => setTimeout(r, 10));
    const t2 = await createThread(workspaceDir, "Beta search term", agents);

    const results = await searchThreads(workspaceDir, "search term");
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe(t2.id);
    expect(results[1].id).toBe(t1.id);
  });

  it("includes archived threads in results", async () => {
    const thread = await createThread(workspaceDir, "Old Work", agents);
    await archiveThread(workspaceDir, thread.id, true);

    const results = await searchThreads(workspaceDir, "old work");
    expect(results).toHaveLength(1);
    expect(results[0].archived).toBe(true);
  });

  it("generates snippet with context around match", async () => {
    const thread = await createThread(workspaceDir, "Chat", agents);
    const longContent = "A".repeat(80) + " findme " + "B".repeat(80);
    await addMessage(workspaceDir, thread.id, {
      role: "user",
      content: longContent,
      timestamp: new Date().toISOString(),
      status: "complete",
    });

    const results = await searchThreads(workspaceDir, "findme");
    expect(results).toHaveLength(1);
    expect(results[0].matchSnippet).toContain("findme");
    expect(results[0].matchSnippet.length).toBeLessThanOrEqual(150);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/thread-store.test.ts`
Expected: FAIL — `searchThreads` is not exported

- [ ] **Step 3: Implement searchThreads**

Add to `src/lib/thread-store.ts`, after the `listThreads` function (after line 84). Also add `ThreadSearchResult` to the import from `./types` on line 4.

```ts
function extractSnippet(text: string, query: string, maxLength: number = 120): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return text.slice(0, maxLength);

  const padding = Math.floor((maxLength - query.length) / 2);
  const start = Math.max(0, index - padding);
  const end = Math.min(text.length, start + maxLength);

  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}

export async function searchThreads(workspaceDir: string, query: string): Promise<ThreadSearchResult[]> {
  await ensureEntourageDir(workspaceDir);
  const dir = getThreadsDir(workspaceDir);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const lowerQuery = query.toLowerCase();
  const results: ThreadSearchResult[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(dir, file), "utf-8");
      const data = JSON.parse(raw) as ThreadWithMessages;
      sanitizeThreadAgents(data);

      const messages = data.messages ?? [];
      const lastMsg = messages[messages.length - 1];
      const titleMatches = data.title.toLowerCase().includes(lowerQuery);

      // Search messages for first match
      let messageMatch: string | null = null;
      for (const msg of messages) {
        if (msg.content.toLowerCase().includes(lowerQuery)) {
          messageMatch = msg.content;
          break;
        }
      }

      if (!titleMatches && !messageMatch) continue;

      const base: ThreadListItem = {
        id: data.id,
        title: data.title,
        agents: data.agents,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        archived: data.archived,
        unreadAgents: data.unreadAgents || [],
        lastMessagePreview: lastMsg?.content?.slice(0, 100) ?? "",
        messageCount: messages.length,
      };

      if (messageMatch) {
        results.push({
          ...base,
          matchSnippet: extractSnippet(messageMatch, query),
          matchSource: "message",
        });
      } else {
        results.push({
          ...base,
          matchSnippet: data.title,
          matchSource: "title",
        });
      }
    } catch {
      // Skip corrupt files
    }
  }

  results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/thread-store.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/thread-store.ts src/lib/__tests__/thread-store.test.ts
git commit -m "feat: add searchThreads function with tests"
```

---

### Task 3: Add search API endpoint

**Files:**
- Create: `src/app/api/threads/search/route.ts`

- [ ] **Step 1: Create the search route**

Create `src/app/api/threads/search/route.ts`:

```ts
import { searchThreads } from "@/lib/thread-store";
import { routeWithWorkspace, badRequest } from "@/lib/api-route";

export const GET = routeWithWorkspace(async ({ url, workspaceDir }) => {
  const query = url.searchParams.get("q");
  if (!query || !query.trim()) {
    throw badRequest("q parameter required");
  }

  return searchThreads(workspaceDir, query.trim());
});
```

- [ ] **Step 2: Verify the build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Then in another terminal: `curl "http://localhost:5555/api/threads/search?q=test&workspaceId=YOUR_WORKSPACE_ID"`
Expected: JSON array of matching threads (or empty array)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/threads/search/route.ts
git commit -m "feat: add GET /api/threads/search endpoint"
```

---

### Task 4: Add search input to ThreadList

**Files:**
- Modify: `src/components/ThreadList.tsx`

- [ ] **Step 1: Add imports and state**

In `src/components/ThreadList.tsx`, add `Search` and `X` to the lucide-react import on line 6:

```ts
import { Menu, Archive, ArchiveRestore, ChevronRight, MoreHorizontal, Pencil, Search, X } from "lucide-react";
```

Add `ThreadSearchResult` to the types import on line 2:

```ts
import { ThreadListItem, ThreadProcess, ThreadSearchResult } from "@/lib/types";
```

Add `useEffect` and `useCallback` to the React import on line 1:

```ts
import { useRef, useState, useEffect, useCallback } from "react";
```

- [ ] **Step 2: Add a `workspaceId` prop to ThreadList**

Add `workspaceId: string;` to the props type of the `ThreadList` component (after `workspaceName?: string;` on line 180). This is needed for the search API call.

- [ ] **Step 3: Add search state and fetch logic**

Add inside the `ThreadList` component, after the existing state declarations (after line 190):

```ts
const [searchQuery, setSearchQuery] = useState("");
const [searchResults, setSearchResults] = useState<ThreadSearchResult[] | null>(null);
const [isSearching, setIsSearching] = useState(false);
const searchInputRef = useRef<HTMLInputElement>(null);
const abortControllerRef = useRef<AbortController | null>(null);

const performSearch = useCallback(
  async (query: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!query.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsSearching(true);

    try {
      const res = await fetch(
        `/api/threads/search?q=${encodeURIComponent(query.trim())}&workspaceId=${encodeURIComponent(workspaceId)}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setSearchResults([]);
      }
    } finally {
      setIsSearching(false);
    }
  },
  [workspaceId]
);

useEffect(() => {
  const timeout = setTimeout(() => {
    performSearch(searchQuery);
  }, 300);
  return () => clearTimeout(timeout);
}, [searchQuery, performSearch]);

const clearSearch = () => {
  setSearchQuery("");
  setSearchResults(null);
  searchInputRef.current?.focus();
};
```

- [ ] **Step 4: Add the search input UI**

Add immediately after the header `</div>` (after line 269, the closing `</div>` of the top bar), before the scrollable thread list area:

```tsx
<div className="px-3 pt-3">
  <div className="relative">
    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
    <input
      ref={searchInputRef}
      type="text"
      placeholder="Search threads..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          clearSearch();
          searchInputRef.current?.blur();
        }
      }}
      className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-800 py-1.5 pl-8 pr-8 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
    />
    {searchQuery && (
      <button
        onClick={clearSearch}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 5: Verify the build**

Run: `npx tsc --noEmit`
Expected: No errors (may show errors if `workspaceId` is not passed from parent yet — that's OK, we'll fix it in the next step)

- [ ] **Step 6: Commit**

```bash
git add src/components/ThreadList.tsx
git commit -m "feat: add search input to ThreadList"
```

---

### Task 5: Wire up search results display

**Files:**
- Modify: `src/components/ThreadList.tsx`

- [ ] **Step 1: Add a highlight helper function**

Add before the `ThreadItem` component (above line 22):

```tsx
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-inherit rounded-sm">
        {part}
      </mark>
    ) : (
      part
    )
  );
}
```

- [ ] **Step 2: Replace the thread list rendering with conditional search results**

Replace the scrollable content area (the `<div className="flex-1 overflow-y-auto ...">` and its contents) with:

```tsx
<div className="flex-1 overflow-y-auto px-2 pt-3 pb-2 flex flex-col gap-1">
  {searchResults !== null ? (
    // Search results mode
    searchResults.length === 0 ? (
      <div className="px-3 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
        No threads found
      </div>
    ) : (
      searchResults.map((result) => (
        <div
          key={result.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelectThread(result.id)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectThread(result.id); } }}
          onContextMenu={(e) => handleContextMenu(e, result)}
          className={`flex w-full gap-3 px-3.5 py-3 text-left transition-colors rounded-xl ${
            result.id === selectedThreadId ? "bg-zinc-100 dark:bg-zinc-800" : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          }`}
        >
          {result.agents.length <= 1 ? (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800"
              style={result.agents[0] ? { border: `1.5px solid ${result.agents[0].avatarColor}`, boxShadow: `inset 0 2px 6px ${result.agents[0].avatarColor}80` } : undefined}
            >
              {result.agents[0] && (
                <ModelIcon model={result.agents[0].model} icon={result.agents[0].icon} className="h-5 w-5" />
              )}
            </div>
          ) : (
            <div className="relative h-10 w-10 shrink-0">
              {result.agents.slice(0, 3).map((agent, i) => {
                const total = Math.min(result.agents.length, 3);
                const size = total === 2 ? 26 : 22;
                const positions =
                  total === 2
                    ? [{ top: 0, left: 0 }, { top: 14, left: 14 }]
                    : [{ top: 0, left: 8 }, { top: 16, left: 0 }, { top: 16, left: 16 }];
                const pos = positions[i];
                return (
                  <div
                    key={agent.id}
                    className="absolute flex items-center justify-center rounded-full bg-white dark:bg-zinc-800"
                    style={{
                      width: size, height: size, top: pos.top, left: pos.left,
                      border: `1.5px solid ${agent.avatarColor}`,
                      boxShadow: `inset 0 1px 3px ${agent.avatarColor}80`,
                      zIndex: total - i,
                    }}
                  >
                    <ModelIcon model={agent.model} icon={agent.icon} className={total === 2 ? "h-3.5 w-3.5" : "h-3 w-3"} />
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {result.matchSource === "title" ? highlightMatch(result.title, searchQuery) : result.title}
              </span>
              <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                {formatDate(result.updatedAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {result.matchSource === "message" ? highlightMatch(result.matchSnippet, searchQuery) : result.lastMessagePreview}
              </span>
              {result.messageCount > 0 && (
                <span className="shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {result.messageCount}
                </span>
              )}
            </div>
          </div>
        </div>
      ))
    )
  ) : (
    // Normal thread list mode
    <>
      {activeThreads.length === 0 && archivedThreads.length === 0 && (
        <div className="px-3 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
          No threads yet. Create one to get started.
        </div>
      )}
      {activeThreads.map((thread) => (
        <ThreadItem
          key={thread.id}
          thread={thread}
          isSelected={thread.id === selectedThreadId}
          statuses={statuses}
          unreadByThread={unreadByThread}
          onSelect={() => onSelectThread(thread.id)}
          onContextMenu={(e) => handleContextMenu(e, thread)}
          onOverflowMenu={(e) => handleContextMenu(e, thread)}
          isMobile={isMobile}
        />
      ))}
      {archivedThreads.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${showArchived ? "rotate-90" : ""}`}
            />
            <Archive className="h-3.5 w-3.5" />
            Archived ({archivedThreads.length})
          </button>
          {showArchived &&
            archivedThreads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isSelected={thread.id === selectedThreadId}
                statuses={statuses}
                unreadByThread={unreadByThread}
                onSelect={() => onSelectThread(thread.id)}
                onContextMenu={(e) => handleContextMenu(e, thread)}
                onOverflowMenu={(e) => handleContextMenu(e, thread)}
                isMobile={isMobile}
              />
            ))}
        </div>
      )}
    </>
  )}
</div>
```

- [ ] **Step 3: Verify the build**

Run: `npx tsc --noEmit`
Expected: No errors (or only errors about missing `workspaceId` prop in parent — addressed next)

- [ ] **Step 4: Commit**

```bash
git add src/components/ThreadList.tsx
git commit -m "feat: wire up search results display with highlighting"
```

---

### Task 6: Pass `workspaceId` prop from layout

**Files:**
- Modify: `src/app/w/[workspaceId]/layout.tsx`

- [ ] **Step 1: Find where ThreadList is rendered and add the workspaceId prop**

In `src/app/w/[workspaceId]/layout.tsx`, find the `<ThreadList` JSX usage and add `workspaceId={workspaceId}` as a prop. The `workspaceId` is already available from the route params in this file.

- [ ] **Step 2: Verify the full build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Manual end-to-end test**

Run: `npm run dev`

1. Open a workspace with threads
2. Type in the search bar — results should appear after 300ms debounce
3. Matching text should be highlighted in yellow
4. Click a result — should navigate to that thread
5. Press Escape — search should clear, normal list restores
6. Click the X button — same behavior as Escape
7. Search for text in an archived thread — should appear in results
8. Search for something with no matches — should show "No threads found"

- [ ] **Step 5: Commit**

```bash
git add src/app/w/[workspaceId]/layout.tsx
git commit -m "feat: pass workspaceId to ThreadList for search"
```
