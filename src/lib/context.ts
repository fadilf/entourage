import { Message, Agent } from "./types";

/**
 * Builds a prompt with the full conversation history.
 * Used when --resume fails and we need to start a fresh CLI session
 * that still has awareness of the entire prior conversation.
 */
export function buildFullHistoryPrompt(
  messages: Message[],
  agentId: string,
  agents: Agent[],
  prompt: string
): string {
  const agentMap = new Map(agents.map((a) => [a.id, a.name]));

  // Include all completed messages except the last user message (which is the current prompt)
  const history = messages.slice(0, -1).filter(
    (m) => m.status === "complete" || m.role === "user"
  );

  if (history.length === 0) {
    return prompt;
  }

  const lines = history.map((m) => {
    const imageNote = m.images && m.images.length > 0 ? ` [with ${m.images.length} image(s)]` : "";
    if (m.role === "user") {
      return `User: ${m.content}${imageNote}`;
    }
    const name = (m.agentId && agentMap.get(m.agentId)) || "Agent";
    return `${name} (agent): ${m.content}${imageNote}`;
  });

  return (
    `[Full conversation history — your previous session was lost]\n` +
    lines.join("\n") +
    `\n[End conversation history]\n\n` +
    prompt
  );
}

/**
 * Builds a prompt enriched with conversation context the agent missed.
 * Finds messages between the agent's last response and the current user message,
 * and prepends them so the agent understands what happened while it wasn't addressed.
 */
export function buildContextualPrompt(
  messages: Message[],
  agentId: string,
  agents: Agent[],
  prompt: string
): string {
  // Find the last completed assistant message from this agent
  let lastAgentMsgIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.agentId === agentId && m.status === "complete") {
      lastAgentMsgIndex = i;
      break;
    }
  }

  // Collect messages after that point, excluding the very last user message
  // (which is already the `prompt` being sent)
  const startIndex = lastAgentMsgIndex + 1;
  // The last message in the array should be the current user message — skip it
  const endIndex = messages.length - 1;

  if (startIndex >= endIndex) {
    return prompt;
  }

  const missed = messages.slice(startIndex, endIndex);
  if (missed.length === 0) {
    return prompt;
  }

  const agentMap = new Map(agents.map((a) => [a.id, a.name]));

  const lines = missed.map((m) => {
    const imageNote = m.images && m.images.length > 0 ? ` [with ${m.images.length} image(s)]` : "";
    if (m.role === "user") {
      return `User: ${m.content}${imageNote}`;
    }
    const name = (m.agentId && agentMap.get(m.agentId)) || "Agent";
    return `${name} (agent): ${m.content}${imageNote}`;
  });

  return (
    `[Conversation context — messages you missed]\n` +
    lines.join("\n") +
    `\n[End conversation context]\n\n` +
    prompt
  );
}
