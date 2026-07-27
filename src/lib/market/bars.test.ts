import { describe, expect, it } from "vitest";
import { aggregateBars, inferPeriodsPerYear, type Bar } from "./bars";

const bar = (time: number, open: number, high: number, low: number, close: number, volume = 1): Bar => ({
  time,
  open,
  high,
  low,
  close,
  volume,
});

describe("aggregateBars", () => {
  it("collapses hourly bars into epoch-aligned 4h buckets", () => {
    const hourly = [
      bar(0, 100, 105, 99, 104),
      bar(3_600, 104, 110, 103, 108),
      bar(7_200, 108, 109, 101, 102),
      bar(10_800, 102, 106, 100, 105),
      bar(14_400, 105, 112, 104, 111),
    ];

    expect(aggregateBars(hourly, 14_400)).toEqual([
      { time: 0, open: 100, high: 110, low: 99, close: 105, volume: 4 },
      { time: 14_400, open: 105, high: 112, low: 104, close: 111, volume: 1 },
    ]);
  });

  it("starts a new bucket whenever the aligned start changes", () => {
    const aggregated = aggregateBars([bar(10_800, 1, 2, 0.5, 1.5), bar(14_400, 2, 3, 1, 2.5)], 14_400);
    expect(aggregated.map(({ time }) => time)).toEqual([0, 14_400]);
  });

  it("rejects a non-positive bucket size", () => {
    expect(() => aggregateBars([], 0)).toThrow(RangeError);
  });
});

describe("inferPeriodsPerYear", () => {
  it("recovers roughly 252 sessions from a daily equity calendar", () => {
    const bars = Array.from({ length: 253 }, (_, index) =>
      // 252 sessions spread across a full calendar year.
      bar(Math.round((index * 365.25 * 86_400) / 252), 1, 1, 1, 1),
    );
    expect(inferPeriodsPerYear(bars)).toBeCloseTo(252, 0);
  });

  it("recovers 365 daily bars for a 24/7 market", () => {
    const bars = Array.from({ length: 366 }, (_, index) => bar(index * 86_400, 1, 1, 1, 1));
    expect(inferPeriodsPerYear(bars)).toBeCloseTo(365.25, 0);
  });

  it("falls back when the series is too short to measure", () => {
    expect(inferPeriodsPerYear([bar(0, 1, 1, 1, 1)])).toBe(252);
    expect(inferPeriodsPerYear([bar(5, 1, 1, 1, 1), bar(5, 1, 1, 1, 1), bar(5, 1, 1, 1, 1)])).toBe(252);
  });
});
