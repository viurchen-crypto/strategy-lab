export const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1D", "1W", "1M"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export interface TimeframeConfig {
  /** Interval understood by the upstream provider. */
  readonly providerInterval: string;
  /** Range requested from the provider, bounded by what it allows per interval. */
  readonly providerRange: string;
  /**
   * When set, provider bars are aggregated into buckets of this many seconds.
   * Used for timeframes the provider does not serve natively.
   */
  readonly bucketSeconds?: number;
  /** How long a cached series stays fresh, in seconds. */
  readonly cacheTtlSeconds: number;
}

/**
 * Yahoo caps intraday history per interval: 5m and 15m reach back 60 days,
 * 1h reaches back 730 days. Requesting more returns an empty result.
 */
export const TIMEFRAME_CONFIG: Record<Timeframe, TimeframeConfig> = {
  "5m": { providerInterval: "5m", providerRange: "60d", cacheTtlSeconds: 900 },
  "15m": { providerInterval: "15m", providerRange: "60d", cacheTtlSeconds: 900 },
  "1h": { providerInterval: "1h", providerRange: "730d", cacheTtlSeconds: 1_800 },
  "4h": { providerInterval: "1h", providerRange: "730d", bucketSeconds: 14_400, cacheTtlSeconds: 1_800 },
  "1D": { providerInterval: "1d", providerRange: "10y", cacheTtlSeconds: 21_600 },
  "1W": { providerInterval: "1wk", providerRange: "max", cacheTtlSeconds: 86_400 },
  "1M": { providerInterval: "1mo", providerRange: "max", cacheTtlSeconds: 86_400 },
};

export function isTimeframe(value: string): value is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(value);
}
