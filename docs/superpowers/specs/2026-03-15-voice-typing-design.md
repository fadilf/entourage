# Voice Typing Mode — Design Spec

## Overview

Add speech-to-text voice typing to the message input. Users click a mic icon inside the textarea to start transcription via the Web Speech API. Transcribed text appears in real-time (with interim results) and is editable before sending. Browser-only — no backend changes.

## Approach

Use the browser's built-in `SpeechRecognition` (Web Speech API). Zero dependencies, no API keys, supports interim results natively. Only renders the mic button in supported browsers (Chrome, Edge). Safari's support for `continuous` mode and `interimResults` is unreliable, so treat it as unsupported.

Note: The Web Speech API requires a secure context (HTTPS or localhost). Since Nexus is a local dev tool running on localhost, this is not a concern in practice.

## New Hook: `useVoiceInput`

**File:** `src/hooks/useVoiceInput.ts`

A custom React hook wrapping the Web Speech API.

### State

- `isListening: boolean` — whether recognition is active
- `interimText: string` — current unfinalized transcription
- `isSupported: boolean` — whether the browser supports `SpeechRecognition`

### API

- `startListening(): void` — requests mic permission, starts recognition
- `stopListening(): void` — stops recognition, finalizes pending text
- `toggle(): void` — convenience start/stop toggle

### Constructor Options

- `onTranscript: (text: string) => void` — callback invoked with finalized transcript text to append to the input. Store in a ref internally (following the `onCompleteRef` pattern in `useSSE.ts`) to avoid stale closures and unnecessary re-creation of the `SpeechRecognition` instance.

### Behavior

- Uses `webkitSpeechRecognition` with `interimResults: true` and `continuous: true`
- `onresult`: final transcripts are passed to `onTranscript` callback. Interim text is stored in `interimText` state for display.
- `onerror`: stops listening, clears interim text. For `not-allowed` errors (mic permission denied), briefly flash the mic icon red to indicate the issue.
- `onend`: if `isListening` is still true (unexpected stop, e.g., silence timeout), auto-restart recognition. Otherwise finalize.
- Language: defaults to `navigator.language`

### Cleanup

The hook must stop recognition and dispose of the instance on unmount via a `useEffect` cleanup function. This prevents callbacks firing on unmounted state when the user switches threads while recording.

## UI Changes: `MessageInput.tsx`

### Idle State

- Small mic icon (`Mic` from lucide-react) positioned absolutely inside the textarea, bottom-right corner (anchored to bottom so it stays near the send button as the textarea auto-resizes)
- Only rendered if `isSupported` is true
- Styling: zinc background circle, violet border on hover
- Textarea gets right padding to avoid text overlapping the mic icon

### Active (Recording) State

- Mic icon swaps to stop-square icon (`Square` from lucide-react)
- Icon background turns red (`bg-red-500`), pulsing animation via CSS
- Entire input container gets violet border (`border-violet-500`) and violet glow (`box-shadow: 0 0 12px rgba(124, 58, 237, 0.3)`)
- Interim text is shown in a small label below the textarea (e.g., `"hearing: authentication module..."`) — NOT appended to the textarea value, to avoid conflicts with user editing
- Textarea remains fully editable during recording — finalized text is appended to `content` state via `onTranscript`, user can freely type and edit

### Stopping

- Triggered by: clicking the stop icon, or pressing `Escape`
- Escape key priority: if voice is active, Escape stops recording. Only if voice is NOT active does Escape close the @mentions dropdown (existing behavior).
- Interim text finalizes via last `onresult` with `isFinal`
- Glow and recording indicators disappear
- Textarea retains all transcribed text, cursor at end

## Data Flow

```
User clicks mic → toggle() → SpeechRecognition.start()
  → onresult (interim) → setInterimText() → shown in label below textarea
  → onresult (final)   → onTranscript(text) → append to content state, clear interim
User clicks stop → stopListening() → SpeechRecognition.stop()
  → onend → clear interim, set isListening=false
```

## Interim Text Display

Interim text is displayed in a small label below the textarea, separate from the textarea value. The `content` state holds only finalized text and user-typed text. When `onTranscript` fires with final text, it appends to `content` and clears `interimText`. This means:

- The textarea value is always `content` — clean and editable
- The user sees what's being heard via the label below
- Only finalized text is sent when the user hits Enter
- No conflicts between user typing and speech recognition output

## File Changes

| File | Change |
|------|--------|
| `src/hooks/useVoiceInput.ts` | New — hook wrapping Web Speech API |
| `src/components/MessageInput.tsx` | Add mic button inside textarea, wire up hook, add recording state styles, add interim text label |

## Scope Exclusions

- No language picker (uses `navigator.language`)
- No audio recording or voice message attachments
- No backend changes or API routes
- No settings or preferences UI for voice
- No fallback for unsupported browsers — mic button simply doesn't render
- No keyboard shortcut to toggle voice (just the button + Escape to stop)
