import { getWorkspaceDir } from "./workspace-store";

export async function resolveWorkspaceDir(request: Request): Promise<string> {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) {
    throw new Error("workspaceId query parameter is required");
  }
  return getWorkspaceDir(workspaceId);
}
