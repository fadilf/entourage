"use client";

import { AgentModel, AgentIcon, Message } from "@/lib/types";
import ModelIcon from "./ModelIcon";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useWsParam } from "@/contexts/WorkspaceContext";

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderContent(content: string, isOwn: boolean) {
  const parts = content.split(/(@\w+)/g);
  if (parts.length === 1) return content;
  return parts.map((part, i) =>
    /^@\w+/.test(part) ? (
      <span
        key={i}
        className={`font-medium ${
          isOwn ? "text-violet-200" : "text-violet-600"
        }`}
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function MessageBubble({
  message,
  isOwn,
  agentName,
  avatarColor,
  model,
  icon,
}: {
  message: Message;
  isOwn: boolean;
  agentName?: string;
  avatarColor?: string;
  model?: AgentModel;
  icon?: AgentIcon;
}) {
  const wsParam = useWsParam();
  const avatar = (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        model ? "bg-zinc-100" : "bg-violet-600 text-white"
      }`}
      style={model ? { border: `1.5px solid ${avatarColor}`, boxShadow: `inset 0 2px 6px ${avatarColor}80` } : undefined}
    >
      {model ? (
        <ModelIcon model={model} icon={icon} className="h-4 w-4" />
      ) : (
        <span className="text-xs font-semibold">Y</span>
      )}
    </div>
  );

  const isError = message.status === "error";
  const isStreaming = message.status === "streaming";

  return (
    <div className={`flex gap-3 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
      {avatar}
      <div className={`flex max-w-[75%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && agentName && (
          <span className="mb-1 text-xs text-zinc-500">
            {agentName}
            {model && (
              <span className="ml-1 text-zinc-400">· {model}</span>
            )}
          </span>
        )}
        {isOwn && message.images && message.images.length > 0 && (
          <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
            {message.images.map((img) => (
              <a
                key={img.id}
                href={`/api/uploads/${img.filename}${wsParam}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={`/api/uploads/${img.filename}${wsParam}`}
                  alt={img.filename}
                  className="max-h-48 max-w-64 rounded-lg border border-white/20 object-cover"
                />
              </a>
            ))}
          </div>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isOwn
              ? "bg-violet-600 text-white whitespace-pre-wrap"
              : isError
              ? "bg-red-50 text-red-900 border border-red-200"
              : "bg-zinc-100 text-zinc-900"
          }`}
        >
          {isOwn ? (
            renderContent(message.content || "", isOwn)
          ) : (
            <div className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1 first:mt-0">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0">{children}</ol>,
                  li: ({ children }) => <li className="mb-0.5">{children}</li>,
                  code: ({ className, children, node }) => {
                    const isBlock = className?.includes("language-") || node?.position?.start.line !== node?.position?.end.line || (typeof children === "string" && children.includes("\n"));
                    return isBlock ? (
                      <code className={`block bg-zinc-800 text-zinc-100 rounded-lg p-3 my-2 text-xs font-mono overflow-x-auto whitespace-pre ${className || ""}`}>
                        {children}
                      </code>
                    ) : (
                      <code className="bg-zinc-200 text-zinc-800 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
                    );
                  },
                  pre: ({ children }) => <>{children}</>,
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-600 underline hover:text-violet-800">
                      {children}
                    </a>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-zinc-300 pl-3 my-2 text-zinc-600 italic">{children}</blockquote>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full text-xs border-collapse">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => <th className="border border-zinc-300 px-2 py-1 bg-zinc-200 font-semibold text-left">{children}</th>,
                  td: ({ children }) => <td className="border border-zinc-300 px-2 py-1">{children}</td>,
                  hr: () => <hr className="my-2 border-zinc-300" />,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                }}
              >
                {message.content || (isStreaming ? "" : "")}
              </ReactMarkdown>
            </div>
          )}
          {isStreaming && !message.content && (
            <span className="text-xs text-zinc-400 italic">Reconnecting...</span>
          )}
          {isStreaming && (
            <span className="inline-flex ml-1">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-500" />
            </span>
          )}
        </div>
        <span className="mt-1 text-[11px] text-zinc-400">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
