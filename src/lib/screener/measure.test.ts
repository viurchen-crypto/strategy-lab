import { describe, expect, it } from "vitest";
import type { Bar } from "../market/bars";
import { measure } from "./measure";

const DAY = 86_400;
const ENTRY = { symbol: "TEST", name: "Test Co", sector: "Industrials" };

/** A series that rises by `step` a day from `start`, beginning at `from`. */
const ramp = (count: number, start: number, step: number, from = Date.UTC(2024, 0, 2) / 1_000): Bar[] =>
  Array.from({ length: count }, (_, index) => {
    const close = start + index * step;
    return {
      time: from + index * DAY,
      open: close - step / 2,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000 + index,
    };
  });

describe("screener measurement", () => {
  it("refuses to measure a series with nothing in it", () => {
    expect(measure(ENTRY, [], null)).toBeNull();
    expect(measure(ENTRY, ramp(1, 100, 1), null)).toBeNull();
  });

  it("reports trailing changes over the right number of sessions", () => {
    const row = measure(ENTRY, ramp(300, 100, 1), null)!;
    // The last close is 399; one session back is 398, five back 394.
    expect(row.price).toBe(399);
    expect(row.change1d).toBeCloseTo(399 / 398 - 1, 6);
    expect(row.change1w).toBeCloseTo(399 / 394 - 1, 6);
    expect(row.change1y).toBeCloseTo(399 / 147 - 1, 6);
  });

  it("leaves a window it lacks the history for as null rather than guessing", () => {
    const row = measure(ENTRY, ramp(30, 100, 1), null)!;
    expect(row.change1m).not.toBeNull();
    expect(row.change1y).toBeNull();
    expect(row.fromMa200).toBeNull();
    expect(row.goldenCross).toBeNull();
  });

  it("places a rising series at the top of its 52-week range", () => {
    const row = measure(ENTRY, ramp(300, 100, 1), null)!;
    expect(row.rangePosition).toBeGreaterThan(0.98);
    expect(row.fromMa50).toBeGreaterThan(0);
    expect(row.goldenCross).toBe(true);
  });

  it("calls a falling series a death cross below both means", () => {
    const row = measure(ENTRY, ramp(300, 500, -1), null)!;
    expect(row.goldenCross).toBe(false);
    expect(row.fromMa200).toBeLessThan(0);
    expect(row.rangePosition).toBeLessThan(0.02);
  });

  it("pins RSI at the extreme when a series only ever rises", () => {
    const row = measure(ENTRY, ramp(60, 100, 1), null)!;
    expect(row.rsi).toBe(100);
  });

  it("measures relative strength against the benchmark's own year", () => {
    const bars = ramp(300, 100, 1);
    const row = measure(ENTRY, bars, 0.5)!;
    expect(row.relativeStrength).toBeCloseTo(row.change1y! - 0.5, 6);
  });

  it("omits relative strength when there is no benchmark to compare against", () => {
    expect(measure(ENTRY, ramp(300, 100, 1), null)!.relativeStrength).toBeNull();
  });

  it("measures year-to-date from the last close of the previous year", () => {
    // Two years of daily bars, so December of the first year is present.
    const bars = ramp(500, 100, 1, Date.UTC(2023, 5, 1) / 1_000);
    const row = measure(ENTRY, bars, null)!;
    const lastYear = new Date(bars.at(-1)!.time * 1_000).getUTCFullYear();
    const reference = bars.filter((bar) => new Date(bar.time * 1_000).getUTCFullYear() < lastYear).at(-1)!;
    expect(row.ytd).toBeCloseTo(bars.at(-1)!.close / reference.close - 1, 6);
  });

  it("reports volatility as a positive annualised rate", () => {
    const row = measure(ENTRY, ramp(300, 100, 1), null)!;
    expect(row.volatility).toBeGreaterThan(0);
    expect(row.atrPercent).toBeGreaterThan(0);
    expect(row.avgVolume).toBeGreaterThan(0);
  });
});
