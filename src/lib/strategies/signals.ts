export type Signal = -1 | 0 | 1;
export type SignalSeries = readonly (Signal | null)[];

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
