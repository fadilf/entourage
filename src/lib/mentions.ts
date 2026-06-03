import { Agent } from "./types";

/**
 * Replace @mentions with just the agent name (e.g. "@codex" → "codex").
 * Mentions are routing metadata, not content for the model.
 */
export function stripMentions(content: string, agents: Agent[]): string {
  return content.replace(/@(\w+)/g, (match, name) => {
    const agent = agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
    return agent ? agent.name : match;
  });
}

export function parseMentions(content: string, agents: Agent[]): Agent[] {
  const mentionPattern = /@(\w+)/g;
  const mentioned: Agent[] = [];
  let match;

  while ((match = mentionPattern.exec(content)) !== null) {
    const name = match[1].toLowerCase();
    const agent = agents.find((a) => a.name.toLowerCase() === name);
    if (agent && !mentioned.find((m) => m.id === agent.id)) {
      mentioned.push(agent);
    }
  }

  return mentioned;
}
