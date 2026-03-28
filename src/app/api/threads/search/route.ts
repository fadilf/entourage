import { searchThreads } from "@/lib/thread-store";
import { routeWithWorkspace, badRequest } from "@/lib/api-route";

export const GET = routeWithWorkspace(async ({ url, workspaceDir }) => {
  const query = url.searchParams.get("q");
  if (!query || !query.trim()) {
    throw badRequest("q parameter required");
  }

  return searchThreads(workspaceDir, query.trim());
});
