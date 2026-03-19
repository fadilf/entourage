export const QUICK_REPLY_INSTRUCTION = `\nAfter responding, append 1-3 brief follow-up suggestions the user might send:\n<QuickReply>\n<Option>suggestion text</Option>\n</QuickReply>`;

const QUICK_REPLY_REGEX = /<QuickReply>[\s\S]*?<\/QuickReply>/;
const OPTION_REGEX = /<Option>([\s\S]*?)<\/Option>/g;

/**
 * Extract suggestion strings from content containing <QuickReply> tags.
 * Returns the suggestions and the content with tags stripped.
 */
export function parseQuickReplies(content: string): { cleaned: string; suggestions: string[] } {
  const match = content.match(QUICK_REPLY_REGEX);
  if (!match) return { cleaned: content, suggestions: [] };

  const suggestions: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = OPTION_REGEX.exec(match[0])) !== null) {
    const text = m[1].trim();
    if (text.length > 0) suggestions.push(text);
  }
  // Reset regex lastIndex
  OPTION_REGEX.lastIndex = 0;

  const cleaned = content.replace(QUICK_REPLY_REGEX, "").trimEnd();
  return { cleaned, suggestions: suggestions.slice(0, 3) };
}
