import { describe, it, expect } from "vitest";
import {
  MCP_CATALOG,
  MCP_CATEGORIES,
  isCatalogEntryInstalled,
  isCatalogEntryAdded,
  filterCatalog,
} from "../mcp-catalog";

describe("mcp-catalog", () => {
  describe("MCP_CATALOG", () => {
    it("has entries with required fields", () => {
      for (const entry of MCP_CATALOG) {
        expect(entry.slug).toBeTruthy();
        expect(entry.name).toBeTruthy();
        expect(entry.description).toBeTruthy();
        expect(entry.category).toBeTruthy();
        expect(entry.icon).toBeTruthy();
        expect(entry.config.transport).toMatch(/^(stdio|sse)$/);
      }
    });

    it("has unique slugs", () => {
      const slugs = MCP_CATALOG.map((e) => e.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("all entries reference a valid category", () => {
      const validKeys = MCP_CATEGORIES.map((c) => c.key);
      for (const entry of MCP_CATALOG) {
        expect(validKeys).toContain(entry.category);
      }
    });
  });

  describe("isCatalogEntryInstalled", () => {
    const stdioEntry = MCP_CATALOG.find((e) => e.config.transport === "stdio")!;
    const matchingServer = {
      transport: "stdio" as const,
      command: (stdioEntry.config as { command: string }).command,
      args: (stdioEntry.config as { args: string[] }).args,
      connected: true,
    };

    it("returns true when command+args match and server is connected", () => {
      expect(isCatalogEntryInstalled(stdioEntry, [matchingServer])).toBe(true);
    });

    it("returns false when command+args match but server is disconnected", () => {
      expect(isCatalogEntryInstalled(stdioEntry, [{ ...matchingServer, connected: false }])).toBe(false);
    });

    it("returns false when no match", () => {
      const installed = [
        { transport: "stdio" as const, command: "other", args: ["--different"], connected: true },
      ];
      expect(isCatalogEntryInstalled(stdioEntry, installed)).toBe(false);
    });

    it("returns false for empty installed list", () => {
      expect(isCatalogEntryInstalled(stdioEntry, [])).toBe(false);
    });
  });

  describe("isCatalogEntryAdded", () => {
    const stdioEntry = MCP_CATALOG.find((e) => e.config.transport === "stdio")!;
    const matchingServer = {
      transport: "stdio" as const,
      command: (stdioEntry.config as { command: string }).command,
      args: (stdioEntry.config as { args: string[] }).args,
    };

    it("returns true when command+args match regardless of connection status", () => {
      expect(isCatalogEntryAdded(stdioEntry, [matchingServer])).toBe(true);
      // isCatalogEntryAdded ignores connected — verify via isCatalogEntryInstalled in three-state tests
    });

    it("returns false when no match", () => {
      expect(isCatalogEntryAdded(stdioEntry, [
        { transport: "stdio", command: "other", args: [] },
      ])).toBe(false);
    });

    it("returns false for empty list", () => {
      expect(isCatalogEntryAdded(stdioEntry, [])).toBe(false);
    });
  });

  describe("three-state install logic", () => {
    const entry = MCP_CATALOG.find((e) => e.config.transport === "stdio")!;
    const cfg = entry.config as { command: string; args: string[] };

    it("not added: isAdded=false, isInstalled=false", () => {
      const servers: never[] = [];
      expect(isCatalogEntryAdded(entry, servers)).toBe(false);
      expect(isCatalogEntryInstalled(entry, servers)).toBe(false);
    });

    it("added but disconnected: isAdded=true, isInstalled=false", () => {
      const servers = [{ transport: "stdio", command: cfg.command, args: cfg.args, connected: false }];
      expect(isCatalogEntryAdded(entry, servers)).toBe(true);
      expect(isCatalogEntryInstalled(entry, servers)).toBe(false);
    });

    it("added and connected: isAdded=true, isInstalled=true", () => {
      const servers = [{ transport: "stdio", command: cfg.command, args: cfg.args, connected: true }];
      expect(isCatalogEntryAdded(entry, servers)).toBe(true);
      expect(isCatalogEntryInstalled(entry, servers)).toBe(true);
    });
  });

  describe("filterCatalog", () => {
    it("returns all entries when no category", () => {
      expect(filterCatalog(MCP_CATALOG)).toEqual(MCP_CATALOG);
    });

    it("filters by category", () => {
      const vis = filterCatalog(MCP_CATALOG, "visualization");
      expect(vis.length).toBeGreaterThan(0);
      expect(vis.every((e) => e.category === "visualization")).toBe(true);
    });

    it("returns empty for unused category", () => {
      const filtered = filterCatalog([], "visualization");
      expect(filtered).toEqual([]);
    });
  });
});
