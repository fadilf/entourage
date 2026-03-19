#!/usr/bin/env node
// Minimal MCP server with an App UI tool for testing
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

const server = new McpServer({ name: "test-ui-server", version: "1.0.0" });

const CHART_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
  h2 { font-size: 14px; margin-bottom: 12px; color: #8b5cf6; }
  .bar-container { display: flex; align-items: flex-end; gap: 8px; height: 160px; padding: 10px 0; }
  .bar-wrapper { display: flex; flex-direction: column; align-items: center; flex: 1; height: 100%; justify-content: flex-end; }
  .bar { min-width: 30px; background: linear-gradient(180deg, #8b5cf6, #6d28d9); border-radius: 4px 4px 0 0; transition: height 0.5s ease; }
  .bar:hover { background: linear-gradient(180deg, #a78bfa, #7c3aed); }
  .label { font-size: 11px; margin-top: 4px; color: #a0a0a0; }
  .status { font-size: 12px; color: #6b7280; margin-top: 12px; }
</style>
</head>
<body>
  <h2>Interactive Chart</h2>
  <div class="bar-container" id="chart"></div>
  <div class="status" id="status">Waiting for data...</div>
  <script>
    window.addEventListener("message", (e) => {
      const data = e.data;
      if (data?.method === "ui/notifications/tool-input" || data?.method === "notifications/tool-input") {
        const input = data.params?.input;
        if (input?.data) {
          const numbers = input.data.split(",").map(Number);
          const max = Math.max(...numbers);
          const chart = document.getElementById("chart");
          chart.innerHTML = numbers.map((n, i) =>
            '<div class="bar-wrapper"><div class="bar" style="height:' + (n / max * 140) + 'px"></div><div class="label">' + n + '</div></div>'
          ).join("");
          document.getElementById("status").textContent = "Showing " + numbers.length + " values";
        }
      }
      if (data?.method === "ui/notifications/tool-result") {
        document.getElementById("status").textContent = "Complete";
      }
    });
  </script>
</body>
</html>`;

// Register tool with UI resource
registerAppTool(
  server,
  "show_chart",
  {
    title: "Show Chart",
    description: "Display an interactive bar chart. Pass comma-separated numbers.",
    inputSchema: { data: z.string().describe("Comma-separated numbers to chart, e.g. '10,25,15,30,20'") },
    _meta: { ui: { resourceUri: "ui://test-ui-server/chart.html" } },
  },
  async ({ data }) => {
    const numbers = data.split(",").map(Number);
    return { content: [{ type: "text", text: `Chart rendered with ${numbers.length} data points: [${numbers.join(", ")}]` }] };
  }
);

// Register the HTML resource
registerAppResource(
  server,
  "Chart View",
  "ui://test-ui-server/chart.html",
  { description: "Interactive bar chart" },
  async () => ({
    contents: [{
      uri: "ui://test-ui-server/chart.html",
      mimeType: RESOURCE_MIME_TYPE,
      text: CHART_HTML,
    }]
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
