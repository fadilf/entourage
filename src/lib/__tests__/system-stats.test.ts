import { describe, it, expect } from "vitest";
import { computeCpuPercents, diskUsageFromStatfs, type CpuSnapshot } from "../system-stats";

describe("computeCpuPercents", () => {
  it("computes busy percent from tick deltas", () => {
    const prev: CpuSnapshot[] = [{ total: 1000, idle: 800 }];
    // 100 more total ticks, 25 of them idle -> 75% busy
    const next: CpuSnapshot[] = [{ total: 1100, idle: 825 }];
    expect(computeCpuPercents(prev, next)).toEqual([75]);
  });

  it("reports 0 for a fully idle core", () => {
    const prev: CpuSnapshot[] = [{ total: 1000, idle: 900 }];
    const next: CpuSnapshot[] = [{ total: 1100, idle: 1000 }];
    expect(computeCpuPercents(prev, next)).toEqual([0]);
  });

  it("reports 100 for a fully busy core", () => {
    const prev: CpuSnapshot[] = [{ total: 1000, idle: 500 }];
    const next: CpuSnapshot[] = [{ total: 1100, idle: 500 }];
    expect(computeCpuPercents(prev, next)).toEqual([100]);
  });

  it("returns 0 when there is no elapsed time (no delta)", () => {
    const snap: CpuSnapshot[] = [{ total: 1000, idle: 800 }];
    expect(computeCpuPercents(snap, snap)).toEqual([0]);
  });

  it("handles multiple cores independently", () => {
    const prev: CpuSnapshot[] = [
      { total: 1000, idle: 800 },
      { total: 2000, idle: 1000 },
    ];
    const next: CpuSnapshot[] = [
      { total: 1100, idle: 850 }, // 50% busy
      { total: 2100, idle: 1000 }, // 100% busy
    ];
    expect(computeCpuPercents(prev, next)).toEqual([50, 100]);
  });

  it("clamps to the 0-100 range", () => {
    const prev: CpuSnapshot[] = [{ total: 1000, idle: 500 }];
    // idle decreased more than total grew (counter quirk) -> clamp to 100
    const next: CpuSnapshot[] = [{ total: 1100, idle: 300 }];
    expect(computeCpuPercents(prev, next)).toEqual([100]);
  });
});

describe("diskUsageFromStatfs", () => {
  it("computes total/used/free bytes and percent", () => {
    // 100 blocks of 1024 bytes = 100 KiB total, 25 blocks free -> 75% used
    const result = diskUsageFromStatfs({ blocks: 100, bsize: 1024, bfree: 25 });
    expect(result).toEqual({
      total: 100 * 1024,
      free: 25 * 1024,
      used: 75 * 1024,
      percent: 75,
    });
  });

  it("reports 0% for an empty disk", () => {
    const result = diskUsageFromStatfs({ blocks: 100, bsize: 4096, bfree: 100 });
    expect(result.used).toBe(0);
    expect(result.percent).toBe(0);
  });

  it("reports 100% for a full disk", () => {
    const result = diskUsageFromStatfs({ blocks: 100, bsize: 4096, bfree: 0 });
    expect(result.free).toBe(0);
    expect(result.percent).toBe(100);
  });

  it("guards against a zero-block filesystem", () => {
    const result = diskUsageFromStatfs({ blocks: 0, bsize: 4096, bfree: 0 });
    expect(result).toEqual({ total: 0, used: 0, free: 0, percent: 0 });
  });
});
