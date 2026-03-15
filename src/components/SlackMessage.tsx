"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Message } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useWsParam } from "@/contexts/WorkspaceContext";

function renderMentions(content: string) {
  const parts = content.split(/(@\w+)/g);
  if (parts.length === 1) return content;
  return parts.map((part, i) =>
    /^@\w+/.test(part) ? (
      <span key={i} className="font-medium text-violet-600">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group/code relative my-2 rounded-lg bg-zinc-900 text-zinc-100">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-zinc-400">
        <span>{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 opacity-0 transition-opacity group-hover/code:opacity-100"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pb-3 text-xs font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function SlackMessage({
  message,
  isUser,
}: {
  message: Message;
  isUser: boolean;
}) {
  const wsParam = useWsParam();
  const isError = message.status === "error";
  const isStreaming = message.status === "streaming";

  return (
    <div className="group relative py-0.5 px-1 -mx-1 rounded hover:bg-zinc-50">
      {/* Hover timestamp */}
      <div className="absolute right-2 top-1 hidden text-[11px] text-zinc-400 group-hover:block">
        {new Date(message.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>

      {/* Message content */}
      {isError ? (
        <div className="flex items-start gap-2 rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{message.content || "An error occurred"}</span>
        </div>
      ) : isUser ? (
        <div className="text-sm leading-relaxed text-zinc-900 whitespace-pre-wrap">
          {renderMentions(message.content || "")}
        </div>
      ) : (
        <div className="slack-markdown text-sm leading-relaxed text-zinc-900">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-base font-bold mt-4 mb-1.5 first:mt-0">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-sm font-bold mt-4 mb-1.5 first:mt-0">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-semibold mt-3 mb-1 first:mt-0">{children}</h3>
              ),
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => (
                <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ol>
              ),
              li: ({ children }) => <li>{children}</li>,
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-600 underline hover:text-violet-800"
                >
                  {children}
                </a>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-zinc-300 bg-zinc-50 pl-3 py-1 my-2 text-zinc-600 italic">
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-2">
                  <table className="min-w-full text-xs border-collapse">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-zinc-100">{children}</thead>,
              th: ({ children }) => (
                <th className="border border-zinc-200 px-2 py-1 font-semibold text-left">{children}</th>
              ),
              td: ({ children }) => (
                <td className="border border-zinc-200 px-2 py-1">{children}</td>
              ),
              tr: ({ children }) => (
                <tr className="even:bg-zinc-50">{children}</tr>
              ),
              hr: () => <hr className="my-3 border-zinc-200" />,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              pre: ({ children }) => <>{children}</>,
              code: ({ className, children }) => {
                const match = /language-(\w+)/.exec(className || "");
                const isBlock = !!className?.includes("language-") || (typeof children === "string" && children.includes("\n"));

                if (!isBlock) {
                  return (
                    <code className="bg-zinc-100 text-zinc-800 rounded px-1.5 py-0.5 text-xs font-mono">
                      {children}
                    </code>
                  );
                }

                const language = match?.[1] || "";
                const codeString = String(children).replace(/\n$/, "");

                return <CodeBlock language={language} code={codeString} />;
              },
            }}
          >
            {message.content || (isStreaming ? "" : "")}
          </ReactMarkdown>
        </div>
      )}

      {/* Image attachments for user messages — rendered below text */}
      {isUser && message.images && message.images.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
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
                className="max-h-48 max-w-64 rounded-lg border border-zinc-200 object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {/* Streaming states */}
      {isStreaming && !message.content && (
        <span className="text-xs text-zinc-400 italic">Reconnecting...</span>
      )}
    </div>
  );
}
