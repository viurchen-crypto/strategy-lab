import { describe, expect, it } from "vitest";

import { STRATEGY_CATALOG } from "./catalog";

describe("STRATEGY_CATALOG", () => {
  it("contains exactly 20 uniquely identified canonical strategies", () => {
    expect(STRATEGY_CATALOG).toHaveLength(20);
    expect(new Set(STRATEGY_CATALOG.map(({ id }) => id)).size).toBe(20);
  });

  it("provides actionable metadata and evidence references for every entry", () => {
    for (const strategy of STRATEGY_CATALOG) {
      expect(strategy.name.length).toBeGreaterThan(3);
      expect(strategy.description.length).toBeGreaterThan(20);
      expect(strategy.parameters.length).toBeGreaterThan(0);
      expect(strategy.evidence.title.length).toBeGreaterThan(3);
      expect(strategy.evidence.url).toMatch(/^https:\/\//);
      expect(strategy.evidence.note.length).toBeGreaterThan(15);
    }
  });

  it("covers trend, breakout, momentum, and mean-reversion families", () => {
    expect(new Set(STRATEGY_CATALOG.map(({ family }) => family))).toEqual(
      new Set(["trend", "breakout", "momentum", "mean-reversion"]),
    );
  });
});
