import { getWorkspaceDir } from "./workspace-store";

export async function resolveWorkspaceDir(request: Request): Promise<string> {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (workspaceId) {
    return getWorkspaceDir(workspaceId);
  }
  return process.env.ENTOURAGE_PROJECT_DIR || process.cwd();
}
