import { readFileSync } from "fs";
import path from "path";
import type {
  ContentBlock,
  PermissionOption,
  SessionNotification,
  ToolCallContent,
} from "@agentclientprotocol/sdk";
import { PermissionLevel } from "./types";
import { StreamEvent } from "./stream-parser";
import { enrichPromptWithAttachments } from "./config";

type AcpUpdate = SessionNotification["update"];

/**
 * Translate a single ACP `session/update` payload into the app's internal
 * StreamEvent representation (the same shape the Claude stream-parser produces),
 * so the rest of the streaming pipeline is agent-agnostic.
 *
 * ACP `agent_message_chunk` notifications carry incremental text deltas (unlike
 * Codex's old `--json` `item.text`, which was cumulative), so we forward them
 * directly without delta tracking.
 */
export function translateAcpUpdate(update: AcpUpdate): StreamEvent[] {
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const content = update.content;
      if (content.type === "text" && content.text) {
        return [{ type: "content", text: content.text }];
      }
      return [];
    }
    case "tool_call": {
      const toolName = update.title || update.kind || "tool";
      const input = update.rawInput ? JSON.stringify(update.rawInput) : undefined;
      const events: StreamEvent[] = [
        { type: "tool_start", toolId: update.toolCallId, toolName, input },
      ];
      // A tool_call can arrive already completed (no separate update follows).
      if (update.status === "completed" || update.status === "failed") {
        events.push({ type: "tool_result", toolId: update.toolCallId, output: extractToolOutput(update.content) });
      }
      return events;
    }
    case "tool_call_update": {
      if (update.status === "completed" || update.status === "failed") {
        return [{ type: "tool_result", toolId: update.toolCallId, output: extractToolOutput(update.content) }];
      }
      return [];
    }
    // user_message_chunk, agent_thought_chunk, plan, available_commands_update,
    // current_mode_update — not surfaced as message content.
    default:
      return [];
  }
}

/** Flatten ACP tool-call content blocks into a plain-text output summary. */
function extractToolOutput(content: ToolCallContent[] | null | undefined): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (item.type === "content") {
      if (item.content.type === "text") parts.push(item.content.text);
    } else if (item.type === "diff") {
      parts.push(`${item.path}\n${item.newText}`);
    } else if (item.type === "terminal") {
      parts.push(`[terminal ${item.terminalId}]`);
    }
  }
  return parts.join("\n");
}

/**
 * Assemble the ACP prompt blocks for one Codex turn: a text block (personality
 * prefix + reference-thread instructions + the user message) plus one image
 * content block per attached image. Personality is prepended per turn to mirror
 * the previous Codex behavior (and keep quick-reply instructions present).
 */
export function buildCodexAcpPrompt(
  prompt: string,
  personality?: string,
  imagePaths?: string[],
  threadPaths?: string[]
): ContentBlock[] {
  // Reference-thread instructions only — images are sent as real content blocks,
  // so we omit the "Read the image file" instruction.
  let text = enrichPromptWithAttachments(prompt, undefined, threadPaths);
  if (personality) {
    text = `[System Instructions]\n${personality}\n[End System Instructions]\n\n${text}`;
  }

  const blocks: ContentBlock[] = [{ type: "text", text }];
  for (const p of imagePaths ?? []) {
    try {
      const data = readFileSync(p).toString("base64");
      blocks.push({ type: "image", data, mimeType: mimeTypeForPath(p) });
    } catch {
      // Unreadable image — skip rather than fail the whole turn.
    }
  }
  return blocks;
}

function mimeTypeForPath(p: string): string {
  switch (path.extname(p).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".bmp": return "image/bmp";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

/**
 * Decide how to answer an ACP `session/request_permission` request based on the
 * thread's permission level, returning the chosen option id (or null to cancel).
 * full / auto-edit auto-approve; supervised rejects (read-only intent).
 */
export function decideCodexPermission(options: PermissionOption[], permissionLevel: PermissionLevel): string | null {
  // Try each kind in preference order (not option order).
  const byKind = (kinds: PermissionOption["kind"][]) => {
    for (const kind of kinds) {
      const match = options.find((o) => o.kind === kind);
      if (match) return match.optionId;
    }
    return undefined;
  };

  if (permissionLevel === "supervised") {
    return byKind(["reject_once", "reject_always"]) ?? options[0]?.optionId ?? null;
  }
  if (permissionLevel === "full") {
    return byKind(["allow_always", "allow_once"]) ?? options[0]?.optionId ?? null;
  }
  // auto-edit
  return byKind(["allow_once", "allow_always"]) ?? options[0]?.optionId ?? null;
}
