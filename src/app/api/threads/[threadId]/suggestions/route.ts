import { NextResponse } from "next/server";
import { resolveWorkspaceDir } from "@/lib/workspace-context";
import { getThread } from "@/lib/thread-store";
import { loadQuickRepliesConfig, getAgent, loadAgents } from "@/lib/agent-store";
import { generateSuggestions } from "@/lib/suggestions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const workspaceDir = await resolveWorkspaceDir(request);
    const thread = await getThread(workspaceDir, threadId);

    if (!thread) {
      return NextResponse.json({ suggestions: [] });
    }

    // Find last completed assistant message with content
    const lastAssistant = [...thread.messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.status === "complete" && m.content.trim().length > 0);

    if (!lastAssistant) {
      return NextResponse.json({ suggestions: [] });
    }

    // Load config and resolve agent
    const config = await loadQuickRepliesConfig();
    let agent = await getAgent(config.agentId);
    if (!agent) {
      const agents = await loadAgents();
      agent = agents[0] ?? null;
    }
    if (!agent) {
      return NextResponse.json({ suggestions: [] });
    }

    // Truncate very long messages to keep the prompt small
    const content = lastAssistant.content.length > 2000
      ? lastAssistant.content.slice(0, 2000) + "\n[truncated]"
      : lastAssistant.content;

    const suggestions = await generateSuggestions(agent, content, workspaceDir);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
