import { describe, expect, it } from "vitest";
import { calculateMaxDrawdown, calculateSharpe, runBacktest, type PriceBar } from "./backtest";

const bars: PriceBar[] = [
  { time: "2024-01-01", open: 100, close: 100 },
  { time: "2024-01-02", open: 110, close: 120 },
  { time: "2024-01-03", open: 90, close: 80 },
  { time: "2024-01-04", open: 70, close: 70 },
];

describe("runBacktest", () => {
  it("executes close signals at the next bar open for long and short positions", () => {
    const result = runBacktest({
      bars,
      targetPositions: [1, -1, 0, 0],
      initialCapital: 1_000,
      commissionBps: 0,
      slippageBps: 0,
    });

    expect(result.trades).toEqual([
      expect.objectContaining({ side: "long", entryTime: "2024-01-02", entryPrice: 110, exitTime: "2024-01-03", exitPrice: 90 }),
      expect.objectContaining({ side: "short", entryTime: "2024-01-03", entryPrice: 90, exitTime: "2024-01-04", exitPrice: 70 }),
    ]);
    expect(result.trades[0].pnl).toBeCloseTo(-181.8181818);
    expect(result.trades[1].pnl).toBeCloseTo(181.8181818);
    expect(result.equity.map(({ equity }) => equity)).toEqual([
      1_000,
      expect.closeTo(1_090.9090909),
      expect.closeTo(909.0909091),
      expect.closeTo(1_000),
    ]);
    expect(result.netPnl).toBeCloseTo(0);
    expect(result.totalReturn).toBeCloseTo(0);
    expect(result.finalEquity).toBeCloseTo(1_000);
  });

  it("applies adverse slippage and commission to entries and exits", () => {
    const result = runBacktest({
      bars: [
        { time: "a", open: 100, close: 100 },
        { time: "b", open: 100, close: 100 },
        { time: "c", open: 110, close: 110 },
      ],
      targetPositions: [1, 0, 0],
      initialCapital: 1_000,
      commissionBps: 10,
      slippageBps: 100,
    });

    const trade = result.trades[0];
    expect(trade.entryPrice).toBeCloseTo(101);
    expect(trade.exitPrice).toBeCloseTo(108.9);
    expect(trade.commission).toBeCloseTo(1 + (1_000 / 101) * 108.9 * 0.001);
    expect(trade.pnl).toBeCloseTo((1_000 / 101) * (108.9 - 101) - trade.commission);
    expect(result.finalEquity).toBeCloseTo(1_000 + trade.pnl);
  });
});

describe("runBacktest risk controls", () => {
  const rising: PriceBar[] = [
    { time: 1, open: 100, high: 100, low: 100, close: 100 },
    { time: 2, open: 100, high: 130, low: 90, close: 120 },
    { time: 3, open: 120, high: 125, low: 115, close: 125 },
  ];

  it("scales quantity with the position size and leaves the trade count alone", () => {
    const full = runBacktest({
      bars: rising,
      targetPositions: [1, 0, 0],
      initialCapital: 1_000,
      commissionBps: 0,
      slippageBps: 0,
    });
    const half = runBacktest({
      bars: rising,
      targetPositions: [1, 0, 0],
      initialCapital: 1_000,
      commissionBps: 0,
      slippageBps: 0,
      positionSizePct: 0.5,
    });

    expect(half.trades).toHaveLength(full.trades.length);
    expect(half.trades[0].quantity).toBeCloseTo(full.trades[0].quantity / 2);
    expect(half.netPnl).toBeCloseTo(full.netPnl / 2);
  });

  it("closes a long on the entry bar when the range reaches the stop", () => {
    const result = runBacktest({
      bars: rising,
      targetPositions: [1, 1, 1],
      initialCapital: 1_000,
      commissionBps: 0,
      slippageBps: 0,
      stopLossPct: 0.05,
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ exitReason: "stop", exitTime: 2, exitPrice: 95 });
    // The signal never changes, so the stopped side stays blocked afterwards.
    expect(result.equity.at(-1)?.equity).toBeCloseTo(950);
  });

  it("takes profit when only the target is reached", () => {
    const result = runBacktest({
      bars: rising,
      targetPositions: [1, 1, 1],
      initialCapital: 1_000,
      commissionBps: 0,
      slippageBps: 0,
      takeProfitPct: 0.2,
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ exitReason: "target", exitPrice: 120 });
  });

  it("assumes the stop filled first when one bar touches both levels", () => {
    const result = runBacktest({
      bars: rising,
      targetPositions: [1, 1, 1],
      initialCapital: 1_000,
      commissionBps: 0,
      slippageBps: 0,
      stopLossPct: 0.05,
      takeProfitPct: 0.2,
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitReason).toBe("stop");
  });

  it("fills at the open when the bar gaps through the stop", () => {
    const result = runBacktest({
      bars: [
        { time: 1, open: 100, high: 100, low: 100, close: 100 },
        { time: 2, open: 100, high: 101, low: 99, close: 100 },
        { time: 3, open: 80, high: 82, low: 78, close: 81 },
      ],
      targetPositions: [1, 1, 1],
      initialCapital: 1_000,
      commissionBps: 0,
      slippageBps: 0,
      stopLossPct: 0.05,
    });

    expect(result.trades[0]).toMatchObject({ exitReason: "stop", exitPrice: 80 });
  });

  it("rejects a position size outside (0, 1]", () => {
    expect(() =>
      runBacktest({
        bars: rising,
        targetPositions: [0, 0, 0],
        initialCapital: 1_000,
        commissionBps: 0,
        slippageBps: 0,
        positionSizePct: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe("metrics", () => {
  it("calculates annualized Sharpe from periodic equity returns", () => {
    expect(calculateSharpe([100, 110, 110, 110], 4)).toBeCloseTo(1.1547005);
    expect(calculateSharpe([100], 252)).toBe(0);
    expect(calculateSharpe([100, 110, 121], 252)).toBe(0);
  });

  it("calculates maximum peak-to-trough drawdown as a positive fraction", () => {
    expect(calculateMaxDrawdown([100, 120, 90, 108, 80])).toBeCloseTo(1 / 3);
    expect(calculateMaxDrawdown([])).toBe(0);
  });
});
