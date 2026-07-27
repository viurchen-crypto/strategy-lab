import { describe, expect, it } from "vitest";
import type { Bar } from "./bars";
import { selectWindow } from "./window";

const bar = (time: number): Bar => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 0 });
const bars: Bar[] = Array.from({ length: 10 }, (_, index) => bar(index * 100));

describe("selectWindow", () => {
  it("returns the whole series when no bounds are given", () => {
    expect(selectWindow(bars, { warmup: 0 })).toEqual({
      signalBars: bars,
      windowStartIndex: 0,
      warmupTruncated: false,
    });
  });

  it("keeps a warm-up prefix ahead of the requested start", () => {
    const selection = selectWindow(bars, { start: 500, warmup: 3 });
    expect(selection.signalBars[0].time).toBe(200);
    expect(selection.windowStartIndex).toBe(3);
    expect(selection.signalBars.at(-1)?.time).toBe(900);
    expect(selection.warmupTruncated).toBe(false);
  });

  it("flags a prefix shorter than the requested warm-up", () => {
    const selection = selectWindow(bars, { start: 100, warmup: 5 });
    expect(selection.windowStartIndex).toBe(1);
    expect(selection.warmupTruncated).toBe(true);
  });

  it("includes a bar landing exactly on the end bound", () => {
    const selection = selectWindow(bars, { start: 200, end: 400, warmup: 0 });
    expect(selection.signalBars.map((entry) => entry.time)).toEqual([200, 300, 400]);
  });

  it("returns nothing when the range selects no bars", () => {
    expect(selectWindow(bars, { start: 5_000, warmup: 2 }).signalBars).toEqual([]);
    expect(selectWindow(bars, { start: 400, end: 300, warmup: 2 }).signalBars).toEqual([]);
  });
});
