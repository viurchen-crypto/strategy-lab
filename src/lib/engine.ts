import { runBacktest, type BacktestResult, type Position, type PriceBar, type Trade } from "./backtest";
import type { BacktestRequest } from "./contracts";
import { getDatabase } from "./db";
import { inferPeriodsPerYear } from "./market/bars";
import { loadSeries, type LoadedSeries } from "./market/store";
import { selectWindow } from "./market/window";
import { buildMetrics, type PerformanceMetrics } from "./metrics";
import { DEFAULT_RANKING, scoreCandidates } from "./ranking";
import { STRATEGY_CATALOG, type StrategyFamily } from "./strategies/catalog";
import { generateSignals, resolveParameters, StrategyConfigError, toPositions } from "./strategies/run";

/** Caps the payload for very long intraday histories while keeping the most recent window. */
const MAX_BARS = 4_000;
const MAX_TRADES_RETURNED = 250;

/** Raised when the request selects a window the loaded series cannot cover. */
export class MarketWindowError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "MarketWindowError";
  }
}

/** Compact `[time, open, high, low, close]` tuple; the array form roughly thirds the JSON payload. */
export type BarTuple = [number, number, number, number, number];

export interface TradeRow {
  readonly side: "long" | "short";
  readonly entryTime: number;
  readonly entryPrice: number;
  readonly exitTime: number;
  readonly exitPrice: number;
  readonly pnl: number;
  readonly return: number;
  readonly exitReason: "signal" | "stop" | "target" | "end";
}

export interface StrategyRun {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly family: StrategyFamily;
  readonly description: string;
  readonly parameters: Record<string, number>;
  readonly metrics: PerformanceMetrics;
  /** Account equity at each bar, aligned index-for-index with `bars`. */
  readonly equity: number[];
  readonly trades: TradeRow[];
  readonly truncatedTrades: number;
  readonly score: number;
  /** Metrics recomputed over each half of the split window; absent when the split is off. */
  readonly inSample?: PerformanceMetrics;
  readonly outOfSample?: PerformanceMetrics;
  readonly warnings: string[];
  readonly error?: string;
}

export interface BacktestResponse {
  readonly symbol: string;
  readonly name: string;
  readonly currency: string;
  readonly exchange: string;
  readonly timeframe: string;
  readonly source: LoadedSeries["source"];
  readonly fetchedAt: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly barCount: number;
  readonly periodsPerYear: number;
  readonly bars: BarTuple[];
  /** Index into `bars` where out-of-sample begins; -1 when the split is disabled. */
  readonly splitIndex: number;
  readonly benchmark: { readonly equity: number[]; readonly metrics: PerformanceMetrics };
  readonly strategies: StrategyRun[];
  /** Assumptions and data caveats that apply to the whole run. */
  readonly notes: string[];
}

const round = (value: number, places = 2): number => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const toTradeRow = (trade: Trade): TradeRow => ({
  side: trade.side,
  entryTime: Number(trade.entryTime),
  entryPrice: round(trade.entryPrice, 4),
  exitTime: Number(trade.exitTime),
  exitPrice: round(trade.exitPrice, 4),
  pnl: round(trade.pnl),
  return: round(trade.return, 6),
  exitReason: trade.exitReason,
});

const roundMetrics = (metrics: PerformanceMetrics): PerformanceMetrics => ({
  netPnl: round(metrics.netPnl),
  totalReturn: round(metrics.totalReturn, 6),
  cagr: round(metrics.cagr, 6),
  sharpe: round(metrics.sharpe, 4),
  sortino: round(metrics.sortino, 4),
  volatility: round(metrics.volatility, 6),
  maxDrawdown: round(metrics.maxDrawdown, 6),
  calmar: round(metrics.calmar, 4),
  winRate: round(metrics.winRate, 6),
  profitFactor: round(metrics.profitFactor, 4),
  expectancy: round(metrics.expectancy),
  tradeCount: metrics.tradeCount,
  exposure: round(metrics.exposure, 6),
});

export async function runBacktestSuite(request: BacktestRequest): Promise<BacktestResponse> {
  const series = await loadSeries(request.symbol, request.timeframe);
  const available = series.bars.slice(-MAX_BARS);
  const notes: string[] = [];

  const warmup = Math.max(...STRATEGY_CATALOG.map((strategy) => strategy.warmup));
  const selection = selectWindow(available, {
    start: request.start,
    end: request.end,
    warmup,
  });
  if (selection.signalBars.length < 2) {
    throw new MarketWindowError("The selected date range contains too few bars to simulate");
  }
  if (selection.warmupTruncated && (request.start !== undefined || available.length < warmup)) {
    notes.push(
      `Warm-up history is shorter than the slowest strategy needs (${warmup} bars); those strategies start flat.`,
    );
  }

  // Signals see the warm-up prefix; the simulation only starts at the window.
  const signalBars = selection.signalBars;
  const start = selection.windowStartIndex;
  const bars = signalBars.slice(start);
  const priceBars: PriceBar[] = bars.map((bar) => ({
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
  const periodsPerYear = inferPeriodsPerYear(bars);

  const costs = {
    initialCapital: request.initialCapital,
    commissionBps: request.commissionBps,
    slippageBps: request.slippageBps,
    positionSizePct: request.positionSizePct ?? 1,
    stopLossPct: request.stopLossPct,
    takeProfitPct: request.takeProfitPct,
    periodsPerYear,
  };

  if (request.stopLossPct || request.takeProfitPct) {
    notes.push(
      "Protective exits fill inside the bar; when a bar touches both the stop and the target the stop is assumed to fill first.",
    );
  }

  const evaluated = STRATEGY_CATALOG.map((strategy) => {
    try {
      const parameters = resolveParameters(strategy, request.parameters?.[strategy.id]);
      const signals = generateSignals(strategy, signalBars, parameters).slice(start);
      const result = runBacktest({
        bars: priceBars,
        targetPositions: toPositions(signals, request.direction),
        ...costs,
      });
      return { strategy, parameters, result, error: undefined as string | undefined };
    } catch (error) {
      // One misconfigured strategy must not take down the whole run.
      const message =
        error instanceof StrategyConfigError || error instanceof RangeError
          ? error.message
          : "Strategy failed to evaluate";
      const flat = runBacktest({ bars: priceBars, targetPositions: priceBars.map(() => 0 as Position), ...costs });
      return { strategy, parameters: {}, result: flat, error: message };
    }
  });

  const splitFraction = request.splitFraction ?? 0;
  // Needs enough bars on both sides for a return series to mean anything.
  const splitIndex =
    splitFraction > 0 && bars.length >= 20 ? Math.floor(bars.length * splitFraction) : -1;

  const scores = scoreCandidates(
    evaluated.map(({ result }) => ({ metrics: result.metrics })),
    DEFAULT_RANKING,
  );

  const strategies: StrategyRun[] = evaluated.map((entry, index) => {
    const split = splitMetrics(entry.result, splitIndex, periodsPerYear, request.initialCapital);
    return {
      id: entry.strategy.id,
      code: entry.strategy.code,
      name: entry.strategy.name,
      family: entry.strategy.family,
      description: entry.strategy.description,
      parameters: entry.parameters,
      metrics: roundMetrics(entry.result.metrics),
      equity: entry.result.equity.map((point) => round(point.equity)),
      trades: entry.result.trades.slice(-MAX_TRADES_RETURNED).map(toTradeRow),
      truncatedTrades: Math.max(0, entry.result.trades.length - MAX_TRADES_RETURNED),
      score: round(scores[index], 1),
      inSample: split && roundMetrics(split.inSample),
      outOfSample: split && roundMetrics(split.outOfSample),
      warnings: buildWarnings(entry.result.metrics, split, bars.length),
      error: entry.error,
    };
  });

  // Buy and hold on the same bars and the same entry cost, as the reference
  // line. Deliberately unlevered and unstopped: it is the do-nothing baseline.
  const benchmarkResult = runBacktest({
    bars: priceBars,
    targetPositions: priceBars.map(() => 1 as Position),
    initialCapital: request.initialCapital,
    commissionBps: request.commissionBps,
    slippageBps: request.slippageBps,
    periodsPerYear,
  });

  const response: BacktestResponse = {
    symbol: series.meta.symbol,
    name: series.meta.name,
    currency: series.meta.currency,
    exchange: series.meta.exchange,
    timeframe: request.timeframe,
    source: series.source,
    fetchedAt: series.fetchedAt,
    periodStart: bars[0].time,
    periodEnd: bars[bars.length - 1].time,
    barCount: bars.length,
    periodsPerYear: round(periodsPerYear, 2),
    bars: bars.map((bar): BarTuple => [
      bar.time,
      round(bar.open, 4),
      round(bar.high, 4),
      round(bar.low, 4),
      round(bar.close, 4),
    ]),
    splitIndex,
    benchmark: {
      equity: benchmarkResult.equity.map((point) => round(point.equity)),
      metrics: roundMetrics(benchmarkResult.metrics),
    },
    strategies,
    notes,
  };

  await recordRun(request, response);
  return response;
}

interface SplitResult {
  readonly inSample: PerformanceMetrics;
  readonly outOfSample: PerformanceMetrics;
}

/**
 * Recomputes metrics over each half of the window. Each half is measured from
 * its own starting equity, so the out-of-sample return is not inflated by
 * whatever the strategy already earned in-sample.
 */
function splitMetrics(
  result: BacktestResult,
  splitIndex: number,
  periodsPerYear: number,
  initialCapital: number,
): SplitResult | undefined {
  if (splitIndex <= 1 || splitIndex >= result.equity.length - 1) return undefined;

  const equity = result.equity.map((point) => point.equity);
  const boundary = Number(result.equity[splitIndex].time);
  const partition = (from: number, to: number, capital: number, trades: Trade[]) => {
    const slice = equity.slice(from, to);
    const times = result.equity.slice(from, to).map((point) => Number(point.time));
    return buildMetrics({
      initialCapital: capital,
      equity: slice,
      trades,
      exposure: slice.length === 0 ? 0 : exposedFraction(times, trades),
      periodsPerYear,
    });
  };

  const before = result.trades.filter((trade) => Number(trade.entryTime) < boundary);
  const after = result.trades.filter((trade) => Number(trade.entryTime) >= boundary);

  return {
    inSample: partition(0, splitIndex + 1, initialCapital, before),
    outOfSample: partition(splitIndex, equity.length, equity[splitIndex], after),
  };
}

/** Share of the given bar times covered by a trade. Both inputs are chronological, so one pass suffices. */
function exposedFraction(times: readonly number[], trades: readonly Trade[]): number {
  if (times.length === 0 || trades.length === 0) return 0;
  let covered = 0;
  let cursor = 0;
  for (const time of times) {
    while (cursor < trades.length && Number(trades[cursor].exitTime) < time) cursor += 1;
    if (cursor >= trades.length) break;
    if (Number(trades[cursor].entryTime) <= time) covered += 1;
  }
  return Math.min(1, covered / times.length);
}

/** Caveats that keep a good-looking in-sample result from reading as a proven edge. */
function buildWarnings(
  metrics: PerformanceMetrics,
  split: SplitResult | undefined,
  barCount: number,
): string[] {
  const warnings: string[] = [];
  if (metrics.tradeCount === 0) warnings.push("No trades were taken in this window");
  else if (metrics.tradeCount < 10) {
    warnings.push(`Only ${metrics.tradeCount} trades: too few to be statistically meaningful`);
  }
  if (metrics.exposure > 0 && metrics.exposure < 0.05) {
    warnings.push("Invested less than 5% of the window");
  }
  if (barCount < 100) warnings.push(`Short sample: ${barCount} bars`);
  if (split && split.inSample.sharpe > 0.5) {
    const drop = 1 - split.outOfSample.sharpe / split.inSample.sharpe;
    if (drop > 0.5) {
      warnings.push(
        `Out-of-sample Sharpe is ${Math.round(drop * 100)}% below in-sample — likely fitted to the early window`,
      );
    }
  }
  return warnings;
}

/** Persists the run for history. Failures are swallowed: the result is already computed. */
async function recordRun(request: BacktestRequest, response: BacktestResponse): Promise<void> {
  const database = getDatabase();
  if (!database) return;
  try {
    const runId = crypto.randomUUID();
    await database.from("backtest_runs").insert(
      response.strategies.map((strategy) => ({
        run_id: runId,
        symbol: response.symbol,
        timeframe: response.timeframe,
        strategy_id: strategy.id,
        direction: request.direction,
        initial_capital: request.initialCapital,
        commission_bps: request.commissionBps,
        slippage_bps: request.slippageBps,
        position_size_pct: request.positionSizePct ?? 1,
        stop_loss_pct: request.stopLossPct ?? null,
        take_profit_pct: request.takeProfitPct ?? null,
        score: strategy.score,
        bar_count: response.barCount,
        period_start: new Date(response.periodStart * 1_000).toISOString(),
        period_end: new Date(response.periodEnd * 1_000).toISOString(),
        metrics: strategy.metrics,
      })),
    );
  } catch {
    // Run history is a convenience, not a requirement.
  }
}
