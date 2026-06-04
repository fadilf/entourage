import os from "os";
import { statfs } from "fs/promises";
import { SystemStats } from "./types";

export type CpuSnapshot = { total: number; idle: number };

/** Cumulative CPU tick counts per core, captured at a single instant. */
export function takeCpuSnapshot(): CpuSnapshot[] {
  return os.cpus().map((c) => {
    const t = c.times;
    return { total: t.user + t.nice + t.sys + t.idle + t.irq, idle: t.idle };
  });
}

/**
 * Derive per-core busy percentages from two snapshots. A single snapshot only
 * holds cumulative ticks since boot, so usage must come from the delta between
 * two reads. Pure + deterministic for testing.
 */
export function computeCpuPercents(prev: CpuSnapshot[], next: CpuSnapshot[]): number[] {
  return prev.map((p, i) => {
    const n = next[i] ?? p;
    const totalDelta = n.total - p.total;
    const idleDelta = n.idle - p.idle;
    if (totalDelta <= 0) return 0;
    const pct = (1 - idleDelta / totalDelta) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  });
}

type StatfsLike = { blocks: number; bsize: number; bfree: number };

/**
 * Derive total/used/free bytes + percent from a statfs result. Uses bfree so
 * that used + free === total exactly. Pure + deterministic for testing.
 */
export function diskUsageFromStatfs(s: StatfsLike): {
  total: number;
  used: number;
  free: number;
  percent: number;
} {
  const total = s.blocks * s.bsize;
  const free = s.bfree * s.bsize;
  const used = total - free;
  return { total, used, free, percent: total > 0 ? Math.round((used / total) * 100) : 0 };
}

/** Filesystem roots to probe — every drive letter on Windows, "/" elsewhere. */
function candidateRoots(): string[] {
  if (process.platform === "win32") {
    return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => `${l}:\\`);
  }
  return ["/"];
}

/** Probe each candidate root; skip any that can't be queried (no media, etc.). */
async function getDisks(): Promise<SystemStats["disks"]> {
  const results = await Promise.all(
    candidateRoots().map(async (mount) => {
      try {
        const s = await statfs(mount);
        const usage = diskUsageFromStatfs(s);
        if (usage.total <= 0) return null;
        return { mount, ...usage };
      } catch {
        return null;
      }
    })
  );
  return results.filter((d): d is NonNullable<typeof d> => d !== null);
}

/**
 * Snapshot host CPU + RAM + disk usage. CPU is sampled across a short window so
 * the percentage reflects current load rather than lifetime average. Works on
 * Windows/macOS/Linux (os.loadavg() is unreliable on Windows, so it is unused).
 */
export async function getSystemStats(sampleMs = 120): Promise<SystemStats> {
  const prev = takeCpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const next = takeCpuSnapshot();

  const perCore = computeCpuPercents(prev, next);
  const percent = perCore.length
    ? Math.round(perCore.reduce((sum, v) => sum + v, 0) / perCore.length)
    : 0;

  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;

  const cpus = os.cpus();
  const disks = await getDisks();
  return {
    cpu: { percent, perCore, cores: cpus.length, model: cpus[0]?.model.trim() ?? "" },
    memory: { total, used, free, percent: total ? Math.round((used / total) * 100) : 0 },
    disks,
    uptime: os.uptime(),
  };
}
