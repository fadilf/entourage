"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Maximize2, Minimize2, AlertCircle } from "lucide-react";

type McpAppBlockProps = {
  toolName: string;
  serverId: string;
  toolInput?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  html?: string;
};

export default function McpAppBlock({
  toolName,
  serverId,
  toolInput,
  toolResult,
  html: initialHtml,
}: McpAppBlockProps) {
  const [html, setHtml] = useState(initialHtml ?? "");
  const [loading, setLoading] = useState(!initialHtml);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(300);

  // Fetch HTML if not provided via SSE (tries cached HTML first, then readResource)
  useEffect(() => {
    if (initialHtml) return;

    (async () => {
      try {
        const toolsRes = await fetch("/api/mcp-servers/tools");
        const tools = await toolsRes.json();
        const bareToolName = toolName.replace(/^mcp__[^_]+__/, "");
        const tool = tools.find(
          (t: { toolName: string; serverId: string }) =>
            t.toolName === bareToolName && t.serverId === serverId
        );
        if (!tool) {
          setError("Tool not found in MCP server");
          setLoading(false);
          return;
        }

        if (tool.cachedHtml) {
          setHtml(tool.cachedHtml);
        } else {
          const res = await fetch("/api/mcp-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "readResource", serverId, uri: tool.resourceUri }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          setHtml(data.html);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [toolName, serverId, initialHtml]);

  // Handle postMessage from iframe (tool calls, size changes, link opens)
  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const data = event.data;

      // MCP App SDK initialization handshake — must respond or the app times out
      if (data?.method === "ui/initialize") {
        iframe.contentWindow?.postMessage(
          {
            jsonrpc: "2.0",
            id: data.id,
            result: {
              protocolVersion: data.params?.protocolVersion ?? "2026-01-26",
              hostInfo: { name: "entourage", version: "0.1.0" },
              hostCapabilities: {
                serverTools: { listChanged: true },
                openLinks: {},
              },
              hostContext: {
                toolInfo: {
                  tool: {
                    name: toolName,
                    inputSchema: { type: "object" },
                  },
                },
              },
            },
          },
          "*"
        );
        return;
      }

      // Acknowledge context updates (no-op but must respond)
      if (data?.method === "ui/update-model-context") {
        iframe.contentWindow?.postMessage(
          { jsonrpc: "2.0", id: data.id, result: {} },
          "*"
        );
        return;
      }

      // After init completes, send tool input/result to the app
      // Use setTimeout to ensure the app has processed its own init before receiving data
      if (data?.method === "ui/notifications/initialized") {
        setTimeout(() => {
          if (toolInput) {
            iframe.contentWindow?.postMessage(
              { jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: toolInput } },
              "*"
            );
          }
          if (toolResult) {
            iframe.contentWindow?.postMessage(
              { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { result: toolResult } },
              "*"
            );
          }
        }, 100);
        return;
      }

      if (data?.method === "ui/notifications/size-changed") {
        const params = data.params ?? data;
        if (typeof params.height === "number") {
          setIframeHeight(Math.min(Math.max(params.height, 100), 800));
        }
        return;
      }

      if (data?.method === "tools/call") {
        try {
          const res = await fetch("/api/mcp-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "callTool",
              serverId,
              toolName: data.params?.name,
              args: data.params?.arguments,
            }),
          });
          const result = await res.json();
          iframe.contentWindow?.postMessage(
            { jsonrpc: "2.0", id: data.id, result: result.result },
            "*"
          );
        } catch (err) {
          iframe.contentWindow?.postMessage(
            { jsonrpc: "2.0", id: data.id, error: { code: -1, message: (err as Error).message } },
            "*"
          );
        }
        return;
      }

      if (data?.method === "ui/open-link") {
        const url = data.params?.url;
        if (url && typeof url === "string") {
          window.open(url, "_blank", "noopener,noreferrer");
          iframe.contentWindow?.postMessage({ jsonrpc: "2.0", id: data.id, result: {} }, "*");
        }
      }
    },
    [serverId]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // Send tool input/result to iframe once loaded
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !html) return;

    const sendData = () => {
      if (toolInput) {
        iframe.contentWindow?.postMessage(
          { jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { input: toolInput } },
          "*"
        );
      }
      if (toolResult) {
        iframe.contentWindow?.postMessage(
          { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { result: toolResult } },
          "*"
        );
      }
    };

    iframe.addEventListener("load", sendData);
    if (iframe.contentDocument?.readyState === "complete") sendData();
    return () => iframe.removeEventListener("load", sendData);
  }, [html, toolInput, toolResult]);

  if (loading) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 text-xs text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading MCP App: {toolName}...
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
        <AlertCircle className="h-3 w-3" />
        MCP App error: {error}
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {toolName}
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        sandbox="allow-scripts allow-forms allow-same-origin"
        style={{ width: "100%", height: expanded ? "600px" : `${iframeHeight}px`, border: "none" }}
        title={`MCP App: ${toolName}`}
      />
    </div>
  );
}
