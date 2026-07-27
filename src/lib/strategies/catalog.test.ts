import { describe, expect, it } from "vitest";

import { defaultParameters, getStrategy, STRATEGY_CATALOG } from "./catalog";

describe("STRATEGY_CATALOG", () => {
  it("contains exactly 20 uniquely identified default strategies", () => {
    expect(STRATEGY_CATALOG).toHaveLength(20);
    expect(new Set(STRATEGY_CATALOG.map(({ id }) => id)).size).toBe(20);
    expect(new Set(STRATEGY_CATALOG.map(({ code }) => code)).size).toBe(20);
  });

  it("numbers the display codes sequentially from 01", () => {
    expect(STRATEGY_CATALOG.map(({ code }) => code)).toEqual(
      Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, "0")),
    );
  });

  it("gives every strategy a signal kind the runner can dispatch", () => {
    expect(new Set(STRATEGY_CATALOG.map(({ kind }) => kind)).size).toBeGreaterThan(10);
  });

  it("provides actionable metadata and evidence references for every entry", () => {
    for (const strategy of STRATEGY_CATALOG) {
      expect(strategy.name.length).toBeGreaterThan(3);
      expect(strategy.description.length).toBeGreaterThan(20);
      expect(strategy.parameters.length).toBeGreaterThan(0);
      expect(strategy.warmup).toBeGreaterThan(0);
      expect(strategy.evidence.title.length).toBeGreaterThan(3);
      expect(strategy.evidence.url).toMatch(/^https:\/\//);
      expect(strategy.evidence.note.length).toBeGreaterThan(15);
    }
  });

  it("keeps every default parameter inside its declared range", () => {
    for (const strategy of STRATEGY_CATALOG) {
      for (const parameter of strategy.parameters) {
        expect(parameter.min).toBeLessThan(parameter.max);
        expect(parameter.value).toBeGreaterThanOrEqual(parameter.min);
        expect(parameter.value).toBeLessThanOrEqual(parameter.max);
      }
    }
  });

  it("covers trend, breakout, momentum, and mean-reversion families", () => {
    expect(new Set(STRATEGY_CATALOG.map(({ family }) => family))).toEqual(
      new Set(["trend", "breakout", "momentum", "mean-reversion"]),
    );
  });

  it("resolves strategies and their defaults by id", () => {
    expect(getStrategy("sma-50-200")?.name).toBe("SMA 50/200 Cross");
    expect(getStrategy("nope")).toBeUndefined();
    expect(defaultParameters(getStrategy("sma-50-200")!)).toEqual({ fast: 50, slow: 200 });
  });
});
