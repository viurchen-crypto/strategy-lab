import { describe, expect, it } from "vitest";
import { BacktestRequestSchema, TIMEFRAMES } from "./contracts";

describe("BacktestRequestSchema", () => {
  it("accepts a daily QQQ backtest with realistic costs", () => {
    const request = BacktestRequestSchema.parse({
      symbol: "QQQ",
      timeframe: "1D",
      strategyId: "sma-50-200",
      initialCapital: 10_000,
      commissionBps: 10,
      slippageBps: 5,
      direction: "both",
    });

    expect(request.symbol).toBe("QQQ");
    expect(request.timeframe).toBe("1D");
  });

  it("supports every agreed TradingView-style timeframe", () => {
    expect(TIMEFRAMES).toEqual(["5m", "15m", "1h", "4h", "1D", "1W", "1M"]);
  });

  it("rejects negative transaction costs", () => {
    expect(() =>
      BacktestRequestSchema.parse({
        symbol: "BTC-USD",
        timeframe: "1h",
        strategyId: "donchian-20",
        initialCapital: 10_000,
        commissionBps: -1,
        slippageBps: 5,
        direction: "both",
      }),
    ).toThrow();
  });
});
