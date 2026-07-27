export interface Bar {
  /** Unix timestamp in seconds, at the open of the bar. */
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface SeriesMeta {
  readonly symbol: string;
  readonly name: string;
  readonly currency: string;
  readonly exchange: string;
  readonly instrumentType: string;
}

export interface Series {
  readonly meta: SeriesMeta;
  readonly bars: readonly Bar[];
}

/**
 * Collapses bars into fixed-width buckets aligned to the Unix epoch. Used to
 * build timeframes the upstream provider does not serve natively, such as 4h.
 */
export function aggregateBars(bars: readonly Bar[], bucketSeconds: number): Bar[] {
  if (!Number.isInteger(bucketSeconds) || bucketSeconds <= 0) {
    throw new RangeError("bucketSeconds must be a positive integer");
  }
  const aggregated: Bar[] = [];
  let bucketStart = Number.NaN;

  for (const bar of bars) {
    const start = Math.floor(bar.time / bucketSeconds) * bucketSeconds;
    const current = aggregated.at(-1);
    if (!current || start !== bucketStart) {
      aggregated.push({ ...bar, time: start });
      bucketStart = start;
      continue;
    }
    aggregated[aggregated.length - 1] = {
      time: current.time,
      open: current.open,
      high: Math.max(current.high, bar.high),
      low: Math.min(current.low, bar.low),
      close: bar.close,
      volume: current.volume + bar.volume,
    };
  }
  return aggregated;
}

/**
 * Bars per calendar year measured from the series itself, so annualized
 * statistics stay correct across assets that trade on different calendars
 * (24/7 crypto versus a 252-session equity year).
 */
export function inferPeriodsPerYear(bars: readonly Bar[], fallback = 252): number {
  if (bars.length < 3) return fallback;
  const spanSeconds = bars[bars.length - 1].time - bars[0].time;
  if (spanSeconds <= 0) return fallback;
  const spanYears = spanSeconds / (365.25 * 86_400);
  const periods = (bars.length - 1) / spanYears;
  return Number.isFinite(periods) && periods > 0 ? periods : fallback;
}
