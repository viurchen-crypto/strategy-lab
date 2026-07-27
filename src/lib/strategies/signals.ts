export type Signal = -1 | 0 | 1;
export type SignalSeries = readonly (Signal | null)[];

/** Minimal bar shape the range-based signals need. */
export interface SignalBar {
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

function validatePrices(prices: readonly number[]): void {
  if (prices.some((price) => !Number.isFinite(price))) {
    throw new RangeError("prices must contain only finite numbers");
  }
}

function validatePeriod(period: number, name = "period"): void {
  if (!Number.isInteger(period) || period <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function rollingStats(prices: readonly number[], end: number, period: number) {
  let sum = 0;
  for (let index = end - period + 1; index <= end; index += 1) sum += prices[index];
  const mean = sum / period;
  let squaredDifference = 0;
  for (let index = end - period + 1; index <= end; index += 1) {
    squaredDifference += (prices[index] - mean) ** 2;
  }
  return { mean, deviation: Math.sqrt(squaredDifference / period) };
}

export function smaCrossoverSignals(
  prices: readonly number[],
  fastPeriod: number,
  slowPeriod: number,
): SignalSeries {
  validatePrices(prices);
  validatePeriod(fastPeriod, "fast period");
  validatePeriod(slowPeriod, "slow period");
  if (fastPeriod >= slowPeriod) throw new RangeError("fast period must be less than slow period");

  return prices.map((_, index) => {
    if (index + 1 < slowPeriod) return null;
    const fast = rollingStats(prices, index, fastPeriod).mean;
    const slow = rollingStats(prices, index, slowPeriod).mean;
    return fast > slow ? 1 : fast < slow ? -1 : 0;
  });
}

export function breakoutSignals(prices: readonly number[], lookback: number): SignalSeries {
  validatePrices(prices);
  validatePeriod(lookback, "lookback");
  let position: Signal = 0;
  return prices.map((price, index) => {
    if (index < lookback) return null;
    let high = -Infinity;
    let low = Infinity;
    for (let cursor = index - lookback; cursor < index; cursor += 1) {
      high = Math.max(high, prices[cursor]);
      low = Math.min(low, prices[cursor]);
    }
    if (price > high) position = 1;
    else if (price < low) position = -1;
    return position;
  });
}

export function momentumSignals(prices: readonly number[], lookback: number): SignalSeries {
  validatePrices(prices);
  validatePeriod(lookback, "lookback");
  return prices.map((price, index) => {
    if (index < lookback) return null;
    return price > prices[index - lookback] ? 1 : price < prices[index - lookback] ? -1 : 0;
  });
}

export function rsiSignals(
  prices: readonly number[],
  period: number,
  lower = 30,
  upper = 70,
): SignalSeries {
  validatePrices(prices);
  validatePeriod(period);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower < 0 || upper > 100 || lower >= upper) {
    throw new RangeError("lower threshold must be less than upper threshold within 0..100");
  }
  const signals: (Signal | null)[] = prices.map(() => null);
  if (prices.length <= period) return signals;

  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = prices[index] - prices[index - 1];
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;

  for (let index = period; index < prices.length; index += 1) {
    if (index > period) {
      const change = prices[index] - prices[index - 1];
      averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
      averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    }
    const rsi = averageLoss === 0 ? (averageGain === 0 ? 50 : 100) : 100 - 100 / (1 + averageGain / averageLoss);
    signals[index] = rsi < lower ? 1 : rsi > upper ? -1 : 0;
  }
  return signals;
}

export function zScoreSignals(
  prices: readonly number[],
  period: number,
  threshold: number,
): SignalSeries {
  validatePrices(prices);
  validatePeriod(period);
  if (!Number.isFinite(threshold) || threshold <= 0) throw new RangeError("threshold must be positive");
  return prices.map((price, index) => {
    if (index + 1 < period) return null;
    const { mean, deviation } = rollingStats(prices, index, period);
    if (deviation === 0) return 0;
    const score = (price - mean) / deviation;
    return score > threshold ? -1 : score < -threshold ? 1 : 0;
  });
}

export function bollingerSignals(
  prices: readonly number[],
  period: number,
  deviations = 2,
): SignalSeries {
  return zScoreSignals(prices, period, deviations);
}

/** Wilder-style smoothing seeded with a simple average, returned per index with nulls during warm-up. */
function emaSeries(prices: readonly number[], period: number): (number | null)[] {
  const multiplier = 2 / (period + 1);
  const out: (number | null)[] = prices.map(() => null);
  if (prices.length < period) return out;
  let value = 0;
  for (let index = 0; index < period; index += 1) value += prices[index];
  value /= period;
  out[period - 1] = value;
  for (let index = period; index < prices.length; index += 1) {
    value = (prices[index] - value) * multiplier + value;
    out[index] = value;
  }
  return out;
}

export function emaCrossoverSignals(
  prices: readonly number[],
  fastPeriod: number,
  slowPeriod: number,
): SignalSeries {
  validatePrices(prices);
  validatePeriod(fastPeriod, "fast period");
  validatePeriod(slowPeriod, "slow period");
  if (fastPeriod >= slowPeriod) throw new RangeError("fast period must be less than slow period");

  const fast = emaSeries(prices, fastPeriod);
  const slow = emaSeries(prices, slowPeriod);
  return prices.map((_, index) => {
    const a = fast[index];
    const b = slow[index];
    if (a === null || b === null) return null;
    return a > b ? 1 : a < b ? -1 : 0;
  });
}

/** Long above the long-horizon mean, short below it: the canonical regime filter. */
export function trendFilterSignals(prices: readonly number[], period: number): SignalSeries {
  validatePrices(prices);
  validatePeriod(period);
  return prices.map((price, index) => {
    if (index + 1 < period) return null;
    const { mean } = rollingStats(prices, index, period);
    return price > mean ? 1 : price < mean ? -1 : 0;
  });
}

export function macdSignals(
  prices: readonly number[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
): SignalSeries {
  validatePrices(prices);
  validatePeriod(fastPeriod, "fast period");
  validatePeriod(slowPeriod, "slow period");
  validatePeriod(signalPeriod, "signal period");
  if (fastPeriod >= slowPeriod) throw new RangeError("fast period must be less than slow period");

  const fast = emaSeries(prices, fastPeriod);
  const slow = emaSeries(prices, slowPeriod);
  // The signal line is an EMA of the MACD line, so it only starts once both legs exist.
  const start = prices.findIndex((_, index) => fast[index] !== null && slow[index] !== null);
  if (start < 0) return prices.map(() => null);

  const macd = prices.slice(start).map((_, offset) => (fast[start + offset] as number) - (slow[start + offset] as number));
  const signalLine = emaSeries(macd, signalPeriod);

  return prices.map((_, index) => {
    if (index < start) return null;
    const line = macd[index - start];
    const trigger = signalLine[index - start];
    if (trigger === null) return null;
    return line > trigger ? 1 : line < trigger ? -1 : 0;
  });
}

/** Wilder's ATR, returned per index with nulls until `period` true ranges exist. */
export function atrSeries(bars: readonly SignalBar[], period: number): (number | null)[] {
  validatePeriod(period);
  const out: (number | null)[] = bars.map(() => null);
  if (bars.length <= period) return out;

  const trueRanges: number[] = [];
  for (let index = 1; index < bars.length; index += 1) {
    const previousClose = bars[index - 1].close;
    trueRanges.push(
      Math.max(
        bars[index].high - bars[index].low,
        Math.abs(bars[index].high - previousClose),
        Math.abs(bars[index].low - previousClose),
      ),
    );
  }

  let atr = 0;
  for (let index = 0; index < period; index += 1) atr += trueRanges[index];
  atr /= period;
  out[period] = atr;
  for (let index = period; index < trueRanges.length; index += 1) {
    atr = (atr * (period - 1) + trueRanges[index]) / period;
    out[index + 1] = atr;
  }
  return out;
}

/**
 * Directional trend: take the +DI/-DI side only while ADX confirms the move has
 * enough strength to be worth following, and stand aside otherwise.
 */
export function adxTrendSignals(
  bars: readonly SignalBar[],
  period: number,
  threshold: number,
): SignalSeries {
  validatePeriod(period);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 100) {
    throw new RangeError("threshold must be within (0, 100)");
  }
  const signals: (Signal | null)[] = bars.map(() => null);
  if (bars.length < period * 2 + 1) return signals;

  const plusMoves: number[] = [];
  const minusMoves: number[] = [];
  const trueRanges: number[] = [];
  for (let index = 1; index < bars.length; index += 1) {
    const up = bars[index].high - bars[index - 1].high;
    const down = bars[index - 1].low - bars[index].low;
    plusMoves.push(up > down && up > 0 ? up : 0);
    minusMoves.push(down > up && down > 0 ? down : 0);
    const previousClose = bars[index - 1].close;
    trueRanges.push(
      Math.max(
        bars[index].high - bars[index].low,
        Math.abs(bars[index].high - previousClose),
        Math.abs(bars[index].low - previousClose),
      ),
    );
  }

  // Wilder smoothing carried forward incrementally: each running total drops one
  // period-average and adds the newest value.
  let smoothedRange = 0;
  let smoothedPlus = 0;
  let smoothedMinus = 0;
  for (let index = 0; index < period; index += 1) {
    smoothedRange += trueRanges[index];
    smoothedPlus += plusMoves[index];
    smoothedMinus += minusMoves[index];
  }

  const dxValues: (number | null)[] = bars.map(() => null);
  for (let index = period - 1; index < trueRanges.length; index += 1) {
    if (index >= period) {
      smoothedRange = smoothedRange - smoothedRange / period + trueRanges[index];
      smoothedPlus = smoothedPlus - smoothedPlus / period + plusMoves[index];
      smoothedMinus = smoothedMinus - smoothedMinus / period + minusMoves[index];
    }
    if (smoothedRange === 0) continue;
    const plus = (100 * smoothedPlus) / smoothedRange;
    const minus = (100 * smoothedMinus) / smoothedRange;
    const sum = plus + minus;
    // `trueRanges[i]` describes the move into bar `i + 1`.
    dxValues[index + 1] = sum === 0 ? 0 : (100 * Math.abs(plus - minus)) / sum;
    signals[index + 1] = plus > minus ? 1 : plus < minus ? -1 : 0;
  }

  let adx: number | null = null;
  let seeded = 0;
  let seedTotal = 0;
  return bars.map((_, index) => {
    const dx = dxValues[index];
    if (dx !== null) {
      if (adx === null) {
        seedTotal += dx;
        seeded += 1;
        if (seeded === period) adx = seedTotal / period;
      } else {
        adx = (adx * (period - 1) + dx) / period;
      }
    }
    const direction = signals[index];
    if (adx === null || direction === null) return null;
    return adx >= threshold ? direction : 0;
  });
}

/** Mean reversion against a fixed percentage envelope around the moving average. */
export function envelopeSignals(
  prices: readonly number[],
  period: number,
  bandPct: number,
): SignalSeries {
  validatePrices(prices);
  validatePeriod(period);
  if (!Number.isFinite(bandPct) || bandPct <= 0) throw new RangeError("bandPct must be positive");
  return prices.map((price, index) => {
    if (index + 1 < period) return null;
    const { mean } = rollingStats(prices, index, period);
    if (price < mean * (1 - bandPct)) return 1;
    if (price > mean * (1 + bandPct)) return -1;
    return 0;
  });
}

/** Stochastic %K reversal: buy the oversold extreme, sell the overbought one. */
export function stochasticSignals(
  bars: readonly SignalBar[],
  period: number,
  lower: number,
  upper: number,
): SignalSeries {
  validatePeriod(period);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower < 0 || upper > 100 || lower >= upper) {
    throw new RangeError("lower threshold must be less than upper threshold within 0..100");
  }
  return bars.map((bar, index) => {
    if (index + 1 < period) return null;
    let high = -Infinity;
    let low = Infinity;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      high = Math.max(high, bars[cursor].high);
      low = Math.min(low, bars[cursor].low);
    }
    if (high === low) return 0;
    const percentK = (100 * (bar.close - low)) / (high - low);
    return percentK < lower ? 1 : percentK > upper ? -1 : 0;
  });
}

/** Volatility-scaled breakout: hold the side the price broke out to and stay there. */
export function atrChannelSignals(
  bars: readonly SignalBar[],
  period: number,
  multiple: number,
): SignalSeries {
  validatePeriod(period);
  if (!Number.isFinite(multiple) || multiple <= 0) throw new RangeError("multiple must be positive");
  const closes = bars.map((bar) => bar.close);
  const atr = atrSeries(bars, period);
  let position: Signal = 0;

  return bars.map((bar, index) => {
    const range = atr[index];
    if (range === null || index + 1 < period) return null;
    const { mean } = rollingStats(closes, index, period);
    if (bar.close > mean + multiple * range) position = 1;
    else if (bar.close < mean - multiple * range) position = -1;
    return position;
  });
}

/**
 * Trend following that steps aside when realized volatility exceeds the target,
 * approximating a volatility-targeted book with a binary position.
 */
export function volatilityFilteredTrendSignals(
  prices: readonly number[],
  trendPeriod: number,
  volPeriod: number,
  maxVolPct: number,
): SignalSeries {
  validatePrices(prices);
  validatePeriod(trendPeriod, "trend period");
  validatePeriod(volPeriod, "volatility period");
  if (!Number.isFinite(maxVolPct) || maxVolPct <= 0) throw new RangeError("maxVolPct must be positive");

  const trend = trendFilterSignals(prices, trendPeriod);
  const returns = prices.map((price, index) =>
    index === 0 || prices[index - 1] === 0 ? 0 : price / prices[index - 1] - 1,
  );

  return prices.map((_, index) => {
    const direction = trend[index];
    if (direction === null || index < volPeriod) return null;
    const { deviation } = rollingStats(returns, index, volPeriod);
    return deviation > maxVolPct ? 0 : direction;
  });
}

/**
 * Dual momentum: take a side only when the absolute return over the lookback and
 * the long-horizon trend agree, otherwise sit in cash.
 */
export function dualMomentumSignals(
  prices: readonly number[],
  lookback: number,
  trendPeriod: number,
): SignalSeries {
  validatePrices(prices);
  validatePeriod(lookback, "lookback");
  validatePeriod(trendPeriod, "trend period");

  const trend = trendFilterSignals(prices, trendPeriod);
  return prices.map((price, index) => {
    const direction = trend[index];
    if (direction === null || index < lookback) return null;
    const absolute = price > prices[index - lookback] ? 1 : price < prices[index - lookback] ? -1 : 0;
    return absolute !== 0 && absolute === direction ? (absolute as Signal) : 0;
  });
}
