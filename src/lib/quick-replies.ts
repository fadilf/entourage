export const QUICK_REPLY_INSTRUCTION = `\nOffer the user quick-reply buttons by embedding a <QuickReply> block in your response. You can place a block anywhere it's relevant — right next to the choice it relates to, not only at the end. Each suggestion goes in its own <Option> tag (1-3 per block), and you may use more than one block in a response. Put each block on its own line. Include at least one set of quick replies, usually at the end of your message, with likely next things the user might say.\n<QuickReply>\n<Option>suggestion text</Option>\n<Option>another suggestion</Option>\n</QuickReply>`;

const CLOSE_TAG = "</QuickReply>";
const OPEN_TAG = "<QuickReply>";
const OPTION_REGEX = /<Option>([\s\S]*?)<\/Option>/g;
const BLOCK_REGEX = /<QuickReply>([\s\S]*?)<\/QuickReply>/g;
const MAX_OPTIONS = 3;

function extractOptions(content: string): string[] {
  return Array.from(content.matchAll(OPTION_REGEX))
    .map((match) => match[1].trim())
    .filter((text) => text.length > 0);
}

/**
 * Only parses quick replies if the content ends with a well-formed, closed
 * <QuickReply>...</QuickReply> block. Dangling/incomplete blocks are never
 * parsed. If multiple blocks exist, only the very last one is considered —
 * and only if it is the last thing in the content.
 *
 * Kept for back-compat (legacy persisted `suggestions`, headless callers).
 * New rendering goes through `splitQuickReplies`.
 */
export function parseQuickReplies(content: string): { cleaned: string; suggestions: string[] } {
  const trimmed = content.trimEnd();

  // Must end with the close tag
  if (!trimmed.endsWith(CLOSE_TAG)) {
    return { cleaned: content, suggestions: [] };
  }

  // Find the last opening tag — that's the start of the only block we care about
  const lastOpen = trimmed.lastIndexOf(OPEN_TAG);
  if (lastOpen === -1) {
    return { cleaned: content, suggestions: [] };
  }

  const block = trimmed.slice(lastOpen);
  const suggestions = extractOptions(block);
  const cleaned = trimmed.slice(0, lastOpen).trimEnd();

  return { cleaned, suggestions: suggestions.slice(0, MAX_OPTIONS) };
}

export type QuickReplySegment =
  | { type: "text"; text: string }
  | { type: "quickreply"; options: string[] };

/**
 * Remove an incomplete trailing quick-reply fragment so raw XML never renders.
 * Any unclosed `<QuickReply>` (the tail has no complete blocks left by the time
 * this runs) is stripped. When streaming, a trailing partial of the open tag
 * (e.g. `...<QuickRep`) is also stripped — only while streaming, so a finished
 * message that legitimately ends in `<` is left untouched.
 */
function stripIncompleteTail(text: string, streaming: boolean): string {
  const open = text.indexOf(OPEN_TAG);
  if (open !== -1) {
    return text.slice(0, open);
  }
  if (streaming) {
    for (let k = OPEN_TAG.length - 1; k > 0; k--) {
      if (text.endsWith(OPEN_TAG.slice(0, k))) {
        return text.slice(0, text.length - k);
      }
    }
  }
  return text;
}

/**
 * Split assistant content into ordered text / quick-reply segments so each
 * `<QuickReply>` block can be rendered as buttons in place. Complete blocks may
 * appear anywhere; incomplete trailing fragments are hidden.
 */
export function splitQuickReplies(
  content: string,
  opts?: { streaming?: boolean }
): QuickReplySegment[] {
  const streaming = opts?.streaming ?? false;
  const segments: QuickReplySegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  BLOCK_REGEX.lastIndex = 0;
  while ((match = BLOCK_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      if (text.trim()) segments.push({ type: "text", text });
    }
    const options = extractOptions(match[1]).slice(0, MAX_OPTIONS);
    if (options.length > 0) segments.push({ type: "quickreply", options });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const tail = stripIncompleteTail(content.slice(lastIndex), streaming);
    if (tail.trim()) segments.push({ type: "text", text: tail });
  }

  return segments;
}
