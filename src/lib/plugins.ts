import { Plugin, GitFileEntry } from "./types";

export const PLUGINS: Plugin[] = [
  {
    id: "git",
    name: "Source Control",
    icon: "GitBranch",
    enabledByDefault: false,
  },
  {
    id: "files",
    name: "File Browser",
    icon: "FolderOpen",
    enabledByDefault: false,
  },
  {
    id: "terminal",
    name: "Terminal",
    icon: "Terminal",
    enabledByDefault: false,
  },
];

export function mapGitStatus(code: string): GitFileEntry["status"] {
  switch (code) {
    case "M": return "modified";
    case "A": return "added";
    case "D": return "deleted";
    case "R": return "renamed";
    default: return "modified";
  }
}
