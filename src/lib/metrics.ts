/** Everything the trade statistics need; the full `Trade` satisfies it. */
export interface TradePnl {
  readonly pnl: number;
}

export interface PerformanceMetrics {
  readonly netPnl: number;
  readonly totalReturn: number;
  readonly cagr: number;
  readonly sharpe: number;
  readonly sortino: number;
  readonly volatility: number;
  readonly maxDrawdown: number;
  readonly calmar: number;
  readonly winRate: number;
  readonly profitFactor: number;
  readonly expectancy: number;
  readonly tradeCount: number;
  readonly exposure: number;
}

/** Profit factor is unbounded when a strategy never loses; report a ceiling instead of Infinity so it stays JSON-safe and rankable. */
export const MAX_PROFIT_FACTOR = 999;

export function periodReturns(equity: readonly number[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < equity.length; index += 1) {
    const previous = equity[index - 1];
    returns.push(previous === 0 ? 0 : equity[index] / previous - 1);
  }
  return returns;
}

export function calculateSharpe(equity: readonly number[], periodsPerYear: number): number {
  const returns = periodReturns(equity);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const standardDeviation = Math.sqrt(variance);
  return standardDeviation === 0 ? 0 : (mean / standardDeviation) * Math.sqrt(periodsPerYear);
}

/** Like Sharpe, but penalizing only downside dispersion. */
export function calculateSortino(equity: readonly number[], periodsPerYear: number): number {
  const returns = periodReturns(equity);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const downside = returns.filter((value) => value < 0);
  if (downside.length === 0) return mean > 0 ? calculateSharpe(equity, periodsPerYear) : 0;
  const deviation = Math.sqrt(downside.reduce((sum, value) => sum + value ** 2, 0) / returns.length);
  return deviation === 0 ? 0 : (mean / deviation) * Math.sqrt(periodsPerYear);
}

export function calculateVolatility(equity: readonly number[], periodsPerYear: number): number {
  const returns = periodReturns(equity);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
}

export function calculateMaxDrawdown(equity: readonly number[]): number {
  let peak = 0;
  let maximum = 0;
  for (const value of equity) {
    peak = Math.max(peak, value);
    if (peak > 0) maximum = Math.max(maximum, (peak - value) / peak);
  }
  return maximum;
}

export function calculateCagr(
  initialCapital: number,
  finalEquity: number,
  barCount: number,
  periodsPerYear: number,
): number {
  const years = (barCount - 1) / periodsPerYear;
  if (years <= 0 || initialCapital <= 0) return 0;
  // A strategy wiped out by a short position has no meaningful growth rate.
  if (finalEquity <= 0) return -1;
  return (finalEquity / initialCapital) ** (1 / years) - 1;
}

export function summarizeTrades(trades: readonly TradePnl[]) {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = trades
    .filter((trade) => trade.pnl < 0)
    .reduce((sum, trade) => sum + Math.abs(trade.pnl), 0);

  return {
    tradeCount: trades.length,
    winRate: trades.length === 0 ? 0 : wins.length / trades.length,
    profitFactor:
      grossLoss === 0
        ? grossProfit > 0
          ? MAX_PROFIT_FACTOR
          : 0
        : Math.min(MAX_PROFIT_FACTOR, grossProfit / grossLoss),
    expectancy:
      trades.length === 0 ? 0 : trades.reduce((sum, trade) => sum + trade.pnl, 0) / trades.length,
  };
}

export function buildMetrics(input: {
  initialCapital: number;
  equity: readonly number[];
  trades: readonly TradePnl[];
  exposure: number;
  periodsPerYear: number;
}): PerformanceMetrics {
  const finalEquity = input.equity.at(-1) ?? input.initialCapital;
  const maxDrawdown = calculateMaxDrawdown(input.equity);
  const cagr = calculateCagr(
    input.initialCapital,
    finalEquity,
    input.equity.length,
    input.periodsPerYear,
  );

  return {
    netPnl: finalEquity - input.initialCapital,
    totalReturn: finalEquity / input.initialCapital - 1,
    cagr,
    sharpe: calculateSharpe(input.equity, input.periodsPerYear),
    sortino: calculateSortino(input.equity, input.periodsPerYear),
    volatility: calculateVolatility(input.equity, input.periodsPerYear),
    maxDrawdown,
    calmar: maxDrawdown === 0 ? 0 : cagr / maxDrawdown,
    exposure: input.exposure,
    ...summarizeTrades(input.trades),
  };
}
