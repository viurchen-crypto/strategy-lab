import { getDatabase } from "../db";
import type { Bar, Series } from "./bars";
import { TIMEFRAME_CONFIG, type Timeframe } from "./timeframes";
import { fetchSeries } from "./yahoo";

export type SeriesSource = "provider" | "database" | "memory";

export interface LoadedSeries extends Series {
  readonly source: SeriesSource;
  readonly fetchedAt: string;
}

interface MemoryEntry {
  series: Series;
  fetchedAt: number;
}

const memory = new Map<string, MemoryEntry>();

const keyOf = (symbol: string, timeframe: Timeframe) => `${symbol.toUpperCase()}:${timeframe}`;

const isFresh = (fetchedAtMs: number, ttlSeconds: number) =>
  Date.now() - fetchedAtMs < ttlSeconds * 1_000;

async function readDatabase(symbol: string, timeframe: Timeframe): Promise<LoadedSeries | null> {
  const database = getDatabase();
  if (!database) return null;

  const { data, error } = await database
    .from("market_series")
    .select("bars, meta, fetched_at")
    .eq("symbol", symbol.toUpperCase())
    .eq("timeframe", timeframe)
    .maybeSingle();

  if (error || !data) return null;
  const fetchedAtMs = Date.parse(data.fetched_at);
  if (!isFresh(fetchedAtMs, TIMEFRAME_CONFIG[timeframe].cacheTtlSeconds)) return null;

  return {
    meta: data.meta as Series["meta"],
    bars: data.bars as Bar[],
    source: "database",
    fetchedAt: data.fetched_at,
  };
}

async function writeDatabase(symbol: string, timeframe: Timeframe, series: Series): Promise<void> {
  const database = getDatabase();
  if (!database) return;
  // Cache writes are best effort: a failure here must not fail the backtest.
  await database
    .from("market_series")
    .upsert(
      {
        symbol: symbol.toUpperCase(),
        timeframe,
        bars: series.bars,
        meta: series.meta,
        bar_count: series.bars.length,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "symbol,timeframe" },
    )
    .then(undefined, () => undefined);
}

/**
 * Resolves a price series through the cache tiers, falling back to the upstream
 * provider on a miss. Fresh data is written back to both tiers.
 */
export async function loadSeries(symbol: string, timeframe: Timeframe): Promise<LoadedSeries> {
  const key = keyOf(symbol, timeframe);
  const ttl = TIMEFRAME_CONFIG[timeframe].cacheTtlSeconds;

  const hit = memory.get(key);
  if (hit && isFresh(hit.fetchedAt, ttl)) {
    return { ...hit.series, source: "memory", fetchedAt: new Date(hit.fetchedAt).toISOString() };
  }

  const stored = await readDatabase(symbol, timeframe);
  if (stored) {
    memory.set(key, { series: { meta: stored.meta, bars: stored.bars }, fetchedAt: Date.parse(stored.fetchedAt) });
    return stored;
  }

  const series = await fetchSeries(symbol, timeframe);
  const fetchedAt = new Date();
  memory.set(key, { series, fetchedAt: fetchedAt.getTime() });
  await writeDatabase(symbol, timeframe, series);
  return { ...series, source: "provider", fetchedAt: fetchedAt.toISOString() };
}

/** Exposed for tests, which must not share state between cases. */
export function clearSeriesCache(): void {
  memory.clear();
}
