import { describe, expect, it } from "vitest";
import type { PerformanceMetrics } from "./metrics";
import { scoreCandidates, type RankingCriterion } from "./ranking";

const metrics = (overrides: Partial<PerformanceMetrics>): { metrics: PerformanceMetrics } => ({
  metrics: {
    netPnl: 0,
    totalReturn: 0,
    cagr: 0,
    sharpe: 0,
    sortino: 0,
    volatility: 0,
    maxDrawdown: 0,
    calmar: 0,
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
    tradeCount: 0,
    exposure: 0,
    ...overrides,
  },
});

const only = (metric: RankingCriterion["metric"]): RankingCriterion[] => [
  { metric, enabled: true, weight: 1 },
];

describe("scoreCandidates", () => {
  it("scores the best and worst candidate at the ends of the scale", () => {
    const scores = scoreCandidates(
      [metrics({ totalReturn: 0.5 }), metrics({ totalReturn: 0.1 }), metrics({ totalReturn: 0.3 })],
      only("totalReturn"),
    );
    expect(scores[0]).toBe(100);
    expect(scores[1]).toBe(0);
    expect(scores[2]).toBeCloseTo(50);
  });

  it("inverts metrics where a smaller value is better", () => {
    const scores = scoreCandidates(
      [metrics({ maxDrawdown: 0.4 }), metrics({ maxDrawdown: 0.1 })],
      only("maxDrawdown"),
    );
    expect(scores).toEqual([0, 100]);
  });

  it("weights criteria against each other", () => {
    const scores = scoreCandidates(
      [metrics({ totalReturn: 1, sharpe: 0 }), metrics({ totalReturn: 0, sharpe: 1 })],
      [
        { metric: "totalReturn", enabled: true, weight: 3 },
        { metric: "sharpe", enabled: true, weight: 1 },
      ],
    );
    expect(scores).toEqual([75, 25]);
  });

  it("ignores disabled and zero-weight criteria", () => {
    const candidates = [metrics({ totalReturn: 1 }), metrics({ totalReturn: 0 })];
    expect(scoreCandidates(candidates, [{ metric: "totalReturn", enabled: false, weight: 1 }])).toEqual([
      100, 100,
    ]);
    expect(scoreCandidates(candidates, [{ metric: "totalReturn", enabled: true, weight: 0 }])).toEqual([
      100, 100,
    ]);
  });

  it("gives every candidate the midpoint when a metric cannot separate them", () => {
    const scores = scoreCandidates(
      [metrics({ sharpe: 1 }), metrics({ sharpe: 1 }), metrics({ sharpe: 1 })],
      only("sharpe"),
    );
    expect(scores).toEqual([50, 50, 50]);
  });

  it("handles the empty and single-candidate cases", () => {
    expect(scoreCandidates([], only("sharpe"))).toEqual([]);
    expect(scoreCandidates([metrics({ sharpe: -3 })], only("sharpe"))).toEqual([100]);
  });
});
