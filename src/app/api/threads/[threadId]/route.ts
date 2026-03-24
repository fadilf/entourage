import { getThread, deleteThread, updateThreadTitle, archiveThread, clearUnreadAgents, updateThreadPermissionLevel, updateThreadCoordinator } from "@/lib/thread-store";
import { getProcessManager } from "@/lib/process-manager";
import { badRequest, notFound, routeWithWorkspace, routeWithWorkspaceJson } from "@/lib/api-route";
import { PermissionLevel } from "@/lib/types";

const VALID_PERMISSION_LEVELS: PermissionLevel[] = ["supervised", "auto-edit", "full"];

type UpdateThreadBody = {
  clearUnread?: boolean;
  archived?: boolean;
  title?: string;
  permissionLevel?: PermissionLevel;
  coordinatorId?: string | null;
  maxAutoDispatches?: number;
};

export const GET = routeWithWorkspace<{ threadId: string }>(async ({ params, workspaceDir }) => {
  const thread = await getThread(workspaceDir, params.threadId);
  if (!thread) {
    throw notFound("Thread not found");
  }
  return thread;
});

export const PATCH = routeWithWorkspaceJson<{ threadId: string }, UpdateThreadBody>(
  async ({ params, workspaceDir, body }) => {
    if (body.clearUnread === true) {
      await clearUnreadAgents(workspaceDir, params.threadId);
      return { success: true };
    }

    if (typeof body.archived === "boolean") {
      const thread = await archiveThread(workspaceDir, params.threadId, body.archived);
      if (!thread) {
        throw notFound("Thread not found");
      }
      return thread;
    }

    if (body.permissionLevel) {
      if (!VALID_PERMISSION_LEVELS.includes(body.permissionLevel)) {
        throw badRequest("Invalid permission level");
      }
      const thread = await updateThreadPermissionLevel(workspaceDir, params.threadId, body.permissionLevel);
      if (!thread) {
        throw notFound("Thread not found");
      }
      return thread;
    }

    if (body.coordinatorId !== undefined || body.maxAutoDispatches !== undefined) {
      const thread = await updateThreadCoordinator(
        workspaceDir,
        params.threadId,
        body.coordinatorId ?? null,
        body.maxAutoDispatches
      );
      if (!thread) {
        throw notFound("Thread not found");
      }
      return thread;
    }

    if (!body.title || typeof body.title !== "string") {
      throw badRequest("Title is required");
    }
    const thread = await updateThreadTitle(workspaceDir, params.threadId, body.title.trim());
    if (!thread) {
      throw notFound("Thread not found");
    }
    return thread;
  }
);

export const DELETE = routeWithWorkspace<{ threadId: string }>(async ({ params, workspaceDir }) => {
  const pm = getProcessManager();
  const thread = await getThread(workspaceDir, params.threadId);
  if (thread) {
    for (const agent of thread.agents) {
      pm.kill(params.threadId, agent.id);
    }
  }
  await deleteThread(workspaceDir, params.threadId);
  return { ok: true };
});
