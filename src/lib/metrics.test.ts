import { describe, expect, it } from "vitest";
import type { Trade } from "./backtest";
import {
  buildMetrics,
  calculateCagr,
  calculateMaxDrawdown,
  calculateSharpe,
  calculateSortino,
  calculateVolatility,
  MAX_PROFIT_FACTOR,
  summarizeTrades,
} from "./metrics";

const trade = (pnl: number): Trade => ({
  side: "long",
  entryTime: 0,
  entryPrice: 100,
  exitTime: 1,
  exitPrice: 100 + pnl,
  quantity: 1,
  pnl,
  return: pnl / 100,
  commission: 0,
  exitReason: "signal",
});

describe("calculateSharpe", () => {
  it("annualizes the mean-to-deviation ratio of periodic returns", () => {
    expect(calculateSharpe([100, 110, 110, 110], 4)).toBeCloseTo(1.1547005);
  });

  it("returns zero when there is no dispersion or too little data", () => {
    expect(calculateSharpe([100], 252)).toBe(0);
    expect(calculateSharpe([100, 110, 121], 252)).toBe(0);
  });
});

describe("calculateSortino", () => {
  it("penalizes only downside dispersion, scoring above Sharpe for the same series", () => {
    const equity = [100, 105, 103, 112, 108, 120];
    expect(calculateSortino(equity, 252)).toBeGreaterThan(calculateSharpe(equity, 252));
  });

  it("falls back to Sharpe when a rising series has no losing period", () => {
    const equity = [100, 110, 115, 130];
    expect(calculateSortino(equity, 252)).toBeCloseTo(calculateSharpe(equity, 252));
  });

  it("is zero for a series that never moves", () => {
    expect(calculateSortino([100, 100, 100], 252)).toBe(0);
  });
});

describe("calculateVolatility", () => {
  it("annualizes the standard deviation of returns", () => {
    expect(calculateVolatility([100, 110, 99, 108.9], 4)).toBeGreaterThan(0);
    expect(calculateVolatility([100, 110, 121], 252)).toBe(0);
  });
});

describe("calculateMaxDrawdown", () => {
  it("measures the deepest peak-to-trough fall as a positive fraction", () => {
    expect(calculateMaxDrawdown([100, 120, 90, 108, 80])).toBeCloseTo(1 / 3);
    expect(calculateMaxDrawdown([])).toBe(0);
    expect(calculateMaxDrawdown([100, 110, 120])).toBe(0);
  });
});

describe("calculateCagr", () => {
  it("compounds the total return over the measured span", () => {
    // 253 daily bars is exactly one 252-period year.
    expect(calculateCagr(1_000, 1_200, 253, 252)).toBeCloseTo(0.2);
    expect(calculateCagr(1_000, 1_440, 505, 252)).toBeCloseTo(0.2, 3);
  });

  it("reports total loss for a wiped-out account and zero for a zero-length span", () => {
    expect(calculateCagr(1_000, 0, 253, 252)).toBe(-1);
    expect(calculateCagr(1_000, 1_200, 1, 252)).toBe(0);
  });
});

describe("summarizeTrades", () => {
  it("derives win rate, profit factor, and expectancy", () => {
    const summary = summarizeTrades([trade(100), trade(-50), trade(50), trade(-25)]);
    expect(summary.tradeCount).toBe(4);
    expect(summary.winRate).toBe(0.5);
    expect(summary.profitFactor).toBeCloseTo(150 / 75);
    expect(summary.expectancy).toBeCloseTo(18.75);
  });

  it("caps profit factor when there are no losses, and zeroes it with no trades", () => {
    expect(summarizeTrades([trade(10)]).profitFactor).toBe(MAX_PROFIT_FACTOR);
    expect(summarizeTrades([]).profitFactor).toBe(0);
    expect(summarizeTrades([]).winRate).toBe(0);
  });
});

describe("buildMetrics", () => {
  it("assembles the full metric set from equity, trades, and exposure", () => {
    const metrics = buildMetrics({
      initialCapital: 1_000,
      equity: [1_000, 1_100, 1_050, 1_200],
      trades: [trade(150), trade(50)],
      exposure: 0.75,
      periodsPerYear: 252,
    });

    expect(metrics.netPnl).toBe(200);
    expect(metrics.totalReturn).toBeCloseTo(0.2);
    expect(metrics.maxDrawdown).toBeCloseTo(50 / 1_100);
    expect(metrics.exposure).toBe(0.75);
    expect(metrics.tradeCount).toBe(2);
    expect(metrics.calmar).toBeCloseTo(metrics.cagr / metrics.maxDrawdown);
  });

  it("reports a zero Calmar when the equity curve never drew down", () => {
    const metrics = buildMetrics({
      initialCapital: 1_000,
      equity: [1_000, 1_100, 1_200],
      trades: [],
      exposure: 1,
      periodsPerYear: 252,
    });
    expect(metrics.maxDrawdown).toBe(0);
    expect(metrics.calmar).toBe(0);
  });
});
