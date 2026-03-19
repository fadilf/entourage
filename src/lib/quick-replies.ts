export const QUICK_REPLY_INSTRUCTION = `\nAfter responding, append exactly one <QuickReply> block containing 1-3 brief follow-up suggestions the user might send. Put each suggestion inside its own <Option> tag, and do not output any text after </QuickReply>.\n<QuickReply>\n<Option>suggestion text</Option>\n<Option>another suggestion</Option>\n</QuickReply>`;

const QUICK_REPLY_BLOCK_REGEX = /<QuickReply>[\s\S]*?<\/QuickReply>/g;
const QUICK_REPLY_TAIL_REGEX = /<QuickReply>[\s\S]*$/;
const OPTION_REGEX = /<Option>([\s\S]*?)<\/Option>/g;

function extractOptions(content: string): string[] {
  return Array.from(content.matchAll(OPTION_REGEX))
    .map((match) => match[1].trim())
    .filter((text) => text.length > 0);
}

/**
 * Extract suggestion strings from content containing <QuickReply> tags.
 * Returns the suggestions and the content with tags stripped.
 */
export function parseQuickReplies(content: string): { cleaned: string; suggestions: string[] } {
  const suggestions = Array.from(content.matchAll(QUICK_REPLY_BLOCK_REGEX))
    .flatMap((match) => extractOptions(match[0]));

  let cleaned = content.replace(QUICK_REPLY_BLOCK_REGEX, "");
  const danglingBlock = cleaned.match(QUICK_REPLY_TAIL_REGEX)?.[0];
  if (danglingBlock) {
    suggestions.push(...extractOptions(danglingBlock));
    cleaned = cleaned.replace(QUICK_REPLY_TAIL_REGEX, "");
  }

  const dedupedSuggestions = suggestions.filter(
    (text, index) => suggestions.indexOf(text) === index
  );

  return { cleaned: cleaned.trimEnd(), suggestions: dedupedSuggestions.slice(0, 3) };
}
