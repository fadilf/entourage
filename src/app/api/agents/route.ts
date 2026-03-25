import { loadAgents, createAgent } from "@/lib/agent-store";
import { badRequest, created, getErrorMessage, route, routeWithJson } from "@/lib/api-route";
import { AgentModel, Icon } from "@/lib/types";

type CreateAgentBody = {
  name?: string;
  model?: AgentModel;
  cliModel?: string;
  avatarColor?: string;
  icon?: Icon;
  personality?: string;
};

export const GET = route(async () => loadAgents());

export const POST = routeWithJson<Record<string, never>, CreateAgentBody>(async ({ body }) => {
  const { name, model, cliModel, avatarColor, icon, personality } = body;
  if (!name || !model || !avatarColor) {
    throw badRequest("name, model, and avatarColor are required");
  }

  try {
    const agent = await createAgent({ name, model, cliModel, avatarColor, icon, personality });
    return created(agent);
  } catch (err) {
    throw badRequest(getErrorMessage(err, "Failed to create agent"));
  }
});
