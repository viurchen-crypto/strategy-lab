import { describe, expect, it } from "vitest";
import { complete, runCommand, type TerminalConfig } from "./commands";

const config: TerminalConfig = {
  symbol: "QQQ",
  timeframe: "1D",
  capital: 10_000,
  commissionBps: 10,
  slippageBps: 5,
  direction: "both",
  positionSizePct: 1,
  splitFraction: 0.7,
};

describe("runCommand", () => {
  it("changes the market and asks for a rerun", () => {
    const result = runCommand("run btc-usd 4h", config);
    expect(result).toMatchObject({ kind: "config", rerun: true });
    if (result.kind !== "config") throw new Error("expected a config result");
    expect(result.config.symbol).toBe("BTC-USD");
    expect(result.config.timeframe).toBe("4h");
    // The original config is never mutated.
    expect(config.symbol).toBe("QQQ");
  });

  it("stores percentage inputs as fractions", () => {
    const sized = runCommand("set size 50", config);
    if (sized.kind !== "config") throw new Error("expected a config result");
    expect(sized.config.positionSizePct).toBe(0.5);

    const stopped = runCommand("set stop 4", config);
    if (stopped.kind !== "config") throw new Error("expected a config result");
    expect(stopped.config.stopLossPct).toBeCloseTo(0.04);
  });

  it("treats a zero stop as switching the stop off", () => {
    const result = runCommand("set stop 0", { ...config, stopLossPct: 0.05 });
    if (result.kind !== "config") throw new Error("expected a config result");
    expect(result.config.stopLossPct).toBeUndefined();
  });

  it("parses a date range and clears it again", () => {
    const set = runCommand("range 2023-01-01 2024-01-01", config);
    if (set.kind !== "config") throw new Error("expected a config result");
    expect(set.config.start).toBe(Date.parse("2023-01-01T00:00:00Z") / 1_000);
    expect(set.config.end).toBe(Date.parse("2024-01-01T00:00:00Z") / 1_000);

    const cleared = runCommand("range all", set.config);
    if (cleared.kind !== "config") throw new Error("expected a config result");
    expect(cleared.config.start).toBeUndefined();
    expect(cleared.config.end).toBeUndefined();
  });

  it("rejects an inverted range, an unknown metric, and an unknown command", () => {
    expect(runCommand("range 2024-01-01 2023-01-01", config).kind).toBe("error");
    expect(runCommand("rank profit", config).kind).toBe("error");
    expect(runCommand("wat", config).kind).toBe("error");
    expect(runCommand("tf 3s", config).kind).toBe("error");
    expect(runCommand("symbol ../etc", config).kind).toBe("error");
  });

  it("collects ranking metrics", () => {
    expect(runCommand("rank sharpe calmar", config)).toMatchObject({
      kind: "ranking",
      metrics: ["sharpe", "calmar"],
    });
  });

  it("explains a catalog strategy and refuses an unknown one", () => {
    const result = runCommand("explain sma-50-200", config);
    expect(result.kind).toBe("output");
    expect(result.lines.join(" ")).toContain("SMA 50/200");
    expect(runCommand("explain nope", config).kind).toBe("error");
  });

  it("validates parameter overrides against the strategy", () => {
    expect(runCommand("param rsi-14-30-70 period 21", config)).toMatchObject({
      kind: "parameter",
      strategyId: "rsi-14-30-70",
      key: "period",
      value: 21,
    });
    expect(runCommand("param rsi-14-30-70 nope 21", config).kind).toBe("error");
  });

  it("bounds the count on printing commands", () => {
    expect(runCommand("top 5", config)).toMatchObject({ kind: "query", query: "top", count: 5 });
    expect(runCommand("trades", config)).toMatchObject({ kind: "query", count: undefined });
    expect(runCommand("top 5000", config)).toMatchObject({ count: 100 });
  });

  it("returns nothing for a blank line", () => {
    expect(runCommand("   ", config)).toEqual({ kind: "output", lines: [] });
  });
});

describe("complete", () => {
  it("completes command names, then their vocabulary", () => {
    expect(complete("ru")).toContain("run");
    expect(complete("tf 1")).toEqual(expect.arrayContaining(["1h", "1D", "1W", "1M"]));
    expect(complete("side l")).toEqual(["long"]);
    expect(complete("explain sma-")).toEqual(
      expect.arrayContaining(["sma-10-30", "sma-20-50", "sma-50-200"]),
    );
    expect(complete("symbol BT")).toEqual(["BTC-USD"]);
    expect(complete("clear ")).toEqual([]);
  });
});
