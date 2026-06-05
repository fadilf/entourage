import fs from "fs/promises";
import path from "path";
import os from "os";
import { ApiRouteError, badRequest, route, routeWithJson } from "@/lib/api-route";

export const GET = route(async ({ url }) => {
  const requestedPath = url.searchParams.get("path") || os.homedir();
  const resolved = path.resolve(requestedPath);

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw badRequest("Not a directory");
    }

    const dirents = await fs.readdir(resolved, { withFileTypes: true });
    const entries = dirents
      .filter((d) => d.isDirectory() || d.isFile())
      .map((d) => ({
        name: d.name,
        type: d.isDirectory() ? ("directory" as const) : ("file" as const),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return { path: resolved, entries };
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw error;
    }
    throw badRequest("Cannot read directory");
  }
});

type CreateFolderBody = { path?: string; name?: string };

export const POST = routeWithJson<Record<string, never>, CreateFolderBody>(async ({ body }) => {
  const parent = (body.path || "").trim();
  const name = (body.name || "").trim();

  if (!parent) {
    throw badRequest("Missing parent path");
  }
  if (!name) {
    throw badRequest("Folder name is required");
  }
  // Reject path separators and traversal so the folder is created directly under the parent.
  if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw badRequest("Invalid folder name");
  }

  const parentResolved = path.resolve(parent);
  const target = path.join(parentResolved, name);

  try {
    const stat = await fs.stat(parentResolved);
    if (!stat.isDirectory()) {
      throw badRequest("Parent is not a directory");
    }
  } catch (error) {
    if (error instanceof ApiRouteError) throw error;
    throw badRequest("Parent directory does not exist");
  }

  try {
    await fs.mkdir(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw badRequest("A folder with that name already exists");
    }
    throw badRequest("Could not create folder");
  }

  return { path: target };
});
