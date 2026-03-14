import { Agent } from "./types";

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
