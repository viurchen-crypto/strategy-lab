import { describe, expect, it } from "vitest";
import { getStrategy, STRATEGY_CATALOG } from "./catalog";
import { generateSignals, resolveParameters, StrategyConfigError, toPositions } from "./run";

const sma = getStrategy("sma-20-50")!;
const rsi = getStrategy("rsi-14-30-70")!;
const bollinger = getStrategy("bollinger-20-2")!;

describe("resolveParameters", () => {
  it("falls back to the catalog defaults when nothing is overridden", () => {
    expect(resolveParameters(sma)).toEqual({ fast: 20, slow: 50 });
  });

  it("clamps overrides into the declared range", () => {
    expect(resolveParameters(sma, { fast: -5, slow: 10_000 })).toEqual({ fast: 2, slow: 400 });
  });

  it("rounds integer parameters but preserves fractional ones", () => {
    expect(resolveParameters(sma, { fast: 12.7 }).fast).toBe(13);
    expect(resolveParameters(bollinger, { deviations: 1.75 }).deviations).toBeCloseTo(1.75);
  });

  it("rejects inverted moving-average and RSI thresholds", () => {
    expect(() => resolveParameters(sma, { fast: 60 })).toThrow(StrategyConfigError);
    expect(() => resolveParameters(rsi, { lower: 45, upper: 55 })).not.toThrow();
    expect(() => resolveParameters(rsi, { lower: 49, upper: 51 })).not.toThrow();
    expect(() => resolveParameters(rsi, { period: Number.NaN })).toThrow(StrategyConfigError);
  });
});

describe("generateSignals", () => {
  it("produces one signal per bar for every catalog strategy", () => {
    const bars = Array.from({ length: 600 }, (_, index) => {
      const close = 100 + Math.sin(index / 9) * 12 + index * 0.1;
      return { high: close * 1.01, low: close * 0.99, close };
    });
    for (const strategy of STRATEGY_CATALOG) {
      const signals = generateSignals(strategy, bars, resolveParameters(strategy));
      expect(signals).toHaveLength(bars.length);
      expect(signals.every((signal) => signal === null || Math.abs(signal) <= 1)).toBe(true);
      // Nothing may trade before the strategy has its warm-up history.
      expect(signals[strategy.warmup - 2] ?? null).toBeNull();
    }
  });
});

describe("toPositions", () => {
  it("maps warm-up nulls to flat", () => {
    expect(toPositions([null, 1, -1], "both")).toEqual([0, 1, -1]);
  });

  it("holds flat rather than inverting a disallowed side", () => {
    expect(toPositions([1, -1, 0], "long")).toEqual([1, 0, 0]);
    expect(toPositions([1, -1, 0], "short")).toEqual([0, -1, 0]);
  });
});
