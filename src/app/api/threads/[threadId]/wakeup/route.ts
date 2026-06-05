import { getProcessManager } from "@/lib/process-manager";
import { routeWithJson, badRequest } from "@/lib/api-route";

type WakeupBody = { agentId?: string; action?: "claim" | "cancel" };

/**
 * Coordinate the server-side ScheduleWakeup timer with a connected tab.
 *
 * - `claim`: the tab takes over a pending wakeup to run it live; cancels the
 *   server's fallback timer. Returns `{ claimed }` — false means the server
 *   already fired headlessly and the client must not double-run.
 * - `cancel`: the user dismissed the wakeup (or sent a manual message / stopped
 *   the agent); drop the server timer and reset the chain.
 */
export const POST = routeWithJson<{ threadId: string }, WakeupBody>(
  async ({ params, body }) => {
    const { agentId, action } = body;
    if (!agentId || !action) throw badRequest("agentId and action required");

    const pm = getProcessManager();
    if (action === "claim") {
      return { claimed: pm.claimWakeup(params.threadId, agentId) };
    }
    pm.cancelWakeup(params.threadId, agentId);
    return { ok: true };
  }
);
