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

  // Fetch HTML from MCP server if not provided
  useEffect(() => {
    if (initialHtml) return;

    (async () => {
      try {
        const toolsRes = await fetch("/api/mcp-servers/tools");
        const tools = await toolsRes.json();
        // CLI tools are prefixed as mcp__<server>__<tool> — strip prefix for matching
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

        const res = await fetch("/api/mcp-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "readResource",
            serverId,
            uri: tool.resourceUri,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setHtml(data.html);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [toolName, serverId, initialHtml]);

  // Handle messages from the iframe
  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const data = event.data;

      // Handle size changes
      if (
        data?.type === "ui/notifications/size-changed" ||
        data?.method === "ui/notifications/size-changed"
      ) {
        const params = data.params ?? data;
        if (typeof params.height === "number") {
          setIframeHeight(Math.min(Math.max(params.height, 100), 800));
        }
        return;
      }

      // Handle tool calls from iframe
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
            {
              jsonrpc: "2.0",
              id: data.id,
              error: { code: -1, message: (err as Error).message },
            },
            "*"
          );
        }
        return;
      }

      // Handle open-link requests
      if (data?.method === "ui/open-link") {
        const url = data.params?.url;
        if (url && typeof url === "string") {
          window.open(url, "_blank", "noopener,noreferrer");
          iframe.contentWindow?.postMessage(
            { jsonrpc: "2.0", id: data.id, result: {} },
            "*"
          );
        }
        return;
      }
    },
    [serverId]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // Send tool input/result to iframe when available
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !html) return;

    const sendData = () => {
      if (toolInput) {
        iframe.contentWindow?.postMessage(
          {
            jsonrpc: "2.0",
            method: "ui/notifications/tool-input",
            params: { input: toolInput },
          },
          "*"
        );
      }
      if (toolResult) {
        iframe.contentWindow?.postMessage(
          {
            jsonrpc: "2.0",
            method: "ui/notifications/tool-result",
            params: { result: toolResult },
          },
          "*"
        );
      }
    };

    iframe.addEventListener("load", sendData);
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
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {toolName}
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <Minimize2 className="h-3 w-3" />
          ) : (
            <Maximize2 className="h-3 w-3" />
          )}
        </button>
      </div>
      {/* Iframe */}
      <iframe
        ref={iframeRef}
        srcDoc={html}
        sandbox="allow-scripts allow-forms"
        style={{
          width: "100%",
          height: expanded ? "600px" : `${iframeHeight}px`,
          border: "none",
        }}
        title={`MCP App: ${toolName}`}
      />
    </div>
  );
}
