import { getThread, addMessage, syncThreadAgents } from "@/lib/thread-store";
import { loadAgents } from "@/lib/agent-store";
import { parseMentions } from "@/lib/mentions";
import { badRequest, notFound, routeWithWorkspaceJson } from "@/lib/api-route";
import { MessageImage } from "@/lib/types";

type ThreadMessageBody = {
  content?: string;
  images?: MessageImage[];
  attachedThreadIds?: string[];
};

export const POST = routeWithWorkspaceJson<{ threadId: string }, ThreadMessageBody>(
  async ({ params, workspaceDir, body }) => {
    const thread = await getThread(workspaceDir, params.threadId);
  if (!thread) {
      throw notFound("Thread not found");
  }

    const { content = "", images, attachedThreadIds } = body;
  if (!content?.trim() && (!images || images.length === 0)) {
      throw badRequest("content or images required");
  }

    const message = await addMessage(workspaceDir, params.threadId, {
    role: "user",
    content: content || "",
    timestamp: new Date().toISOString(),
    status: "complete",
    ...(images && images.length > 0 ? { images } : {}),
    ...(attachedThreadIds && attachedThreadIds.length > 0 ? { attachedThreads: attachedThreadIds } : {}),
    });

    const allAgents = await loadAgents();
    const mentionedAgents = parseMentions(content, allAgents);
    const fallbackAgent = thread.agents[0] ?? allAgents[0];

    // When a coordinator is set and 2+ agents are mentioned, route through coordinator only
    let targetAgents: typeof mentionedAgents;
    if (mentionedAgents.length > 1 && thread.coordinatorId) {
      const coordinator = mentionedAgents.find((a) => a.id === thread.coordinatorId)
        ?? allAgents.find((a) => a.id === thread.coordinatorId);
      targetAgents = coordinator ? [coordinator] : mentionedAgents;
    } else {
      targetAgents = mentionedAgents.length > 0 ? mentionedAgents : fallbackAgent ? [fallbackAgent] : [];
    }
    if (targetAgents.length === 0) {
      throw badRequest("No agents available");
    }

    const activeAgent = targetAgents[targetAgents.length - 1];
    const { thread: updatedThread, changed: threadUpdated } =
      targetAgents.length > 0 && activeAgent
        ? await syncThreadAgents(workspaceDir, params.threadId, targetAgents, activeAgent.id)
        : { thread, changed: false };

    return {
      message,
      targetAgents,
      threadUpdated,
      thread: updatedThread,
    };
  }
);
