# Thread Search Design

**Date:** 2026-03-27
**Status:** Approved

## Overview

Add full-text search to the sidebar thread list, allowing users to search across all thread titles and message content within a workspace. Results replace the thread list inline, showing a snippet of the matching message.

## Approach

Simple file scan (Approach A). A new API endpoint reads thread JSON files from disk, performs case-insensitive string matching, and returns results. No new dependencies or indexing infrastructure — matches the existing file-based architecture. Suitable for the local dev tool use case where thread counts are in the tens to low hundreds.

## API

### `GET /api/threads/search`

**Query params:**
- `q` (string, required) — search query
- `workspaceId` (string, required) — workspace to search within

**Behavior:**
1. Resolve workspace directory from `workspaceId`
2. Read all thread JSON files from `.entourage/threads/`
3. For each thread, case-insensitive search across:
   - Thread title
   - All message `content` fields
4. Return matches sorted by `updatedAt` descending

**Response type:**

```ts
type ThreadSearchResult = ThreadListItem & {
  matchSnippet: string;   // ~120 chars around first match in message content
  matchSource: "title" | "message";
};
```

**Snippet generation:**
- If the match is in the title, `matchSnippet` contains the title and `matchSource` is `"title"`
- If the match is in a message, extract ~120 characters of context around the first occurrence and set `matchSource` to `"message"`
- If both title and message match, prefer showing the message snippet (title match is already visible)

**File:** `src/app/api/threads/search/route.ts`

## UI — Search Input

**File:** `src/components/ThreadList.tsx`

**Placement:** Top of the thread list, above thread items, below workspace name.

**Elements:**
- `Search` icon (lucide-react) on the left
- Text input, placeholder: `"Search threads..."`
- `X` button appears when input is non-empty; clicking clears search

**Behavior:**
- When input is empty, normal thread list displays
- As user types, debounce 300ms, then fire search API
- `Escape` key clears the search field and restores normal list

**Styling:** Matches sidebar aesthetic — `bg-zinc-100`, `text-zinc-900`, rounded, compact height, no border.

## UI — Search Results Display

**File:** `src/components/ThreadList.tsx`

When a search query is active, the thread list switches to search results mode:

- Same thread item layout as normal list (agent avatars, title, timestamp, message count)
- `lastMessagePreview` is replaced with `matchSnippet` — the search term is **bolded** within the snippet
- If the match is in the title, the matching portion of the title is bolded and the preview stays as-is
- Archived threads are included in results (flat list, no collapsible section)
- Empty state: centered "No threads found" message
- Clicking a result navigates to that thread as usual

No changes to `ThreadDetail` — search is purely a sidebar concern.

## Client-Side Wiring

Self-contained within `ThreadList.tsx` — no new context providers or hooks.

**State:**
- `searchQuery: string` — bound to input
- `searchResults: ThreadSearchResult[] | null` — `null` = not searching, `[]` = no results
- `isSearching: boolean` — optional subtle loading indicator

**Fetch logic:**
- On input change, debounce 300ms, then fetch search endpoint
- Use `AbortController` to cancel previous in-flight request on new keystroke
- When `searchQuery` is cleared, set `searchResults` to `null` to restore normal list

**Rendering logic:**
- `searchResults === null` → normal thread list (active + archived sections)
- `searchResults !== null` → flat results list (no active/archived grouping)

## Out of Scope

- Jump-to-message within thread detail
- Fuzzy matching or relevance ranking
- Search indexing or caching
- Keyboard shortcut to focus search
- Searching tool call content or content blocks
