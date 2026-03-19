"use client";

import { X, ExternalLink, Github } from "lucide-react";
import Logo from "@/components/Logo";

type Props = {
  open: boolean;
  onClose: () => void;
};

const REPO_URL = "https://github.com/fadilf/entourage";
const VERSION = "0.1.0";

export default function AboutDialog({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-zinc-700 flex items-center justify-center">
              <Logo className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Entourage</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">v{VERSION}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Description */}
        <div className="px-5 py-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            A multi-agent coding tool with a unified chat UI for real-time streaming conversations. Spawn CLI agents against local project directories.
          </p>
        </div>

        {/* Links */}
        <div className="px-5 pb-5 flex flex-col gap-1.5">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <Github size={16} className="text-zinc-400" />
            GitHub Repository
            <ExternalLink size={12} className="ml-auto text-zinc-400" />
          </a>
          <a
            href={`${REPO_URL}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-zinc-400">
              <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="8" r="2" />
            </svg>
            Report an Issue
            <ExternalLink size={12} className="ml-auto text-zinc-400" />
          </a>
          <a
            href={`${REPO_URL}#readme`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-zinc-400">
              <path d="M2 2h8l4 4v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm8.5.5v3.5H14M4 8h8M4 10.5h8M4 13h5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            README
            <ExternalLink size={12} className="ml-auto text-zinc-400" />
          </a>
        </div>
      </div>
    </div>
  );
}
