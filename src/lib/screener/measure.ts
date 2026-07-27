import type { Bar } from "../market/bars";

export interface ScreenerRow {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string;
  readonly price: number;
  /** Trailing changes over the given windows, as fractions. */
  readonly change1d: number | null;
  readonly change1w: number | null;
  readonly change1m: number | null;
  readonly change1y: number | null;
  readonly ytd: number | null;
  /** Where the price sits in its 52-week range, 0 at the low and 1 at the high. */
  readonly rangePosition: number | null;
  /** Distance from the 50- and 200-day means, as fractions of the mean. */
  readonly fromMa50: number | null;
  readonly fromMa200: number | null;
  /** True when the 50-day mean is above the 200-day mean. */
  readonly goldenCross: boolean | null;
  readonly rsi: number | null;
  readonly atrPercent: number | null;
  readonly volatility: number | null;
  readonly avgVolume: number | null;
  /** Return relative to the benchmark over the trailing year. */
  readonly relativeStrength: number | null;
}

const TRADING_DAYS = 252;

const mean = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

/** The change over `periods` bars, or null when the history is too short. */
function change(closes: number[], periods: number): number | null {
  if (closes.length <= periods) return null;
  const past = closes[closes.length - 1 - periods];
  const last = closes[closes.length - 1];
  return past > 0 ? last / past - 1 : null;
}

function movingAverage(closes: number[], period: number): number | null {
  return closes.length < period ? null : mean(closes.slice(-period));
}

/** Wilder's RSI, the same definition the RSI strategy uses. */
function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;

  let gain = 0;
  let loss = 0;
  for (let index = closes.length - period; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }

  const averageGain = gain / period;
  const averageLoss = loss / period;
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function averageTrueRange(bars: readonly Bar[], period = 14): number | null {
  if (bars.length <= period) return null;

  let total = 0;
  for (let index = bars.length - period; index < bars.length; index += 1) {
    const previousClose = bars[index - 1].close;
    total += Math.max(
      bars[index].high - bars[index].low,
      Math.abs(bars[index].high - previousClose),
      Math.abs(bars[index].low - previousClose),
    );
  }
  return total / period;
}

/** Annualised standard deviation of daily log returns over the trailing quarter. */
function volatility(closes: number[], period = 63): number | null {
  if (closes.length <= period) return null;

  const returns: number[] = [];
  for (let index = closes.length - period; index < closes.length; index += 1) {
    if (closes[index - 1] > 0) returns.push(Math.log(closes[index] / closes[index - 1]));
  }
  const average = mean(returns);
  if (average === null || returns.length < 2) return null;

  const variance =
    returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * TRADING_DAYS);
}

/** Bars since the last close of the previous calendar year. */
function yearToDate(bars: readonly Bar[]): number | null {
  const last = bars.at(-1);
  if (!last) return null;

  const year = new Date(last.time * 1_000).getUTCFullYear();
  // The reference is the final close *before* January, so a January run has one.
  const opening = bars.filter((bar) => new Date(bar.time * 1_000).getUTCFullYear() < year).at(-1);
  return opening && opening.close > 0 ? last.close / opening.close - 1 : null;
}

/**
 * Everything the screen shows, computed from daily OHLCV.
 *
 * The provider's quote and fundamentals endpoints now refuse unauthenticated
 * requests, so there is no P/E and no market cap here — this is a technical
 * screen, and saying so is better than showing a stale number from somewhere.
 */
export function measure(
  entry: { symbol: string; name: string; sector: string },
  bars: readonly Bar[],
  benchmarkChange1y: number | null,
): ScreenerRow | null {
  const last = bars.at(-1);
  if (!last || bars.length < 2) return null;

  const closes = bars.map((bar) => bar.close);
  const window52 = bars.slice(-TRADING_DAYS);
  const high = Math.max(...window52.map((bar) => bar.high));
  const low = Math.min(...window52.map((bar) => bar.low));

  const ma50 = movingAverage(closes, 50);
  const ma200 = movingAverage(closes, 200);
  const atr = averageTrueRange(bars);
  const change1y = change(closes, TRADING_DAYS);

  return {
    symbol: entry.symbol,
    name: entry.name,
    sector: entry.sector,
    price: last.close,
    change1d: change(closes, 1),
    change1w: change(closes, 5),
    change1m: change(closes, 21),
    change1y,
    ytd: yearToDate(bars),
    rangePosition: high > low ? (last.close - low) / (high - low) : null,
    fromMa50: ma50 ? last.close / ma50 - 1 : null,
    fromMa200: ma200 ? last.close / ma200 - 1 : null,
    goldenCross: ma50 !== null && ma200 !== null ? ma50 > ma200 : null,
    rsi: rsi(closes),
    atrPercent: atr !== null && last.close > 0 ? atr / last.close : null,
    volatility: volatility(closes),
    avgVolume: mean(bars.slice(-21).map((bar) => bar.volume)),
    relativeStrength:
      change1y !== null && benchmarkChange1y !== null ? change1y - benchmarkChange1y : null,
  };
}
