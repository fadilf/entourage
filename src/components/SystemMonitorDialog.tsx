"use client";

import { useState, useEffect } from "react";
import { Activity, Cpu, MemoryStick, HardDrive } from "lucide-react";
import { SystemStats } from "@/lib/types";
import Dialog from "./Dialog";

const POLL_MS = 1500;

function formatBytes(bytes: number): string {
  const tb = bytes / 1024 ** 4;
  if (tb >= 1) return `${tb.toFixed(1)} TB`;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function barColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-violet-500";
}

function Meter({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
      <div
        className={`h-full rounded-full transition-all duration-500 ${barColor(percent)}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export default function SystemMonitorDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const poll = () =>
      fetch("/api/system/stats")
        .then((r) => {
          if (!r.ok) throw new Error(`Request failed (${r.status})`);
          return r.json();
        })
        .then((d: SystemStats) => {
          if (!active) return;
          setStats(d);
          setError(null);
        })
        .catch((err) => {
          if (active) setError(err instanceof Error ? err.message : "Error");
        });
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="flex w-full max-w-md flex-col rounded-xl bg-white dark:bg-zinc-800 shadow-xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-5 py-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-violet-500" />
            <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Resource Monitor
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto px-5 py-5">
          {error && !stats ? (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
              {error}
            </div>
          ) : !stats ? (
            <div className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
              Loading…
            </div>
          ) : (
            <>
              {/* CPU */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    <Cpu className="h-4 w-4 text-zinc-400" />
                    CPU
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {stats.cpu.percent}%
                  </span>
                </div>
                <Meter percent={stats.cpu.percent} />
                {stats.cpu.perCore.length > 1 && (
                  <div className="mt-3 flex items-end gap-1" title="Per-core usage">
                    {stats.cpu.perCore.map((core, i) => (
                      <div
                        key={i}
                        className="flex h-10 flex-1 items-end overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-700/50"
                        title={`Core ${i}: ${core}%`}
                      >
                        <div
                          className={`w-full transition-all duration-500 ${barColor(core)}`}
                          style={{ height: `${Math.max(core, 2)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {stats.cpu.model && (
                  <div className="mt-2 truncate text-xs text-zinc-400 dark:text-zinc-500">
                    {stats.cpu.model} · {stats.cpu.cores} cores
                  </div>
                )}
              </div>

              {/* Memory */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    <MemoryStick className="h-4 w-4 text-zinc-400" />
                    Memory
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {stats.memory.percent}%
                  </span>
                </div>
                <Meter percent={stats.memory.percent} />
                <div className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                  {formatBytes(stats.memory.used)} / {formatBytes(stats.memory.total)} used
                </div>
              </div>

              {/* Storage */}
              {stats.disks.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    <HardDrive className="h-4 w-4 text-zinc-400" />
                    Storage
                  </div>
                  <div className="flex flex-col gap-3">
                    {stats.disks.map((disk) => (
                      <div key={disk.mount}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-zinc-600 dark:text-zinc-400">
                            {disk.mount}
                          </span>
                          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                            {formatBytes(disk.used)} / {formatBytes(disk.total)} ({disk.percent}%)
                          </span>
                        </div>
                        <Meter percent={disk.percent} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-5 py-2.5 text-xs text-zinc-400 dark:text-zinc-500">
          Stats for the machine running Entourage
        </div>
      </div>
    </Dialog>
  );
}
