import { z } from "zod";
import { loadSeries } from "@/lib/market/store";
import { MarketDataError } from "@/lib/market/yahoo";
import { measure, type ScreenerRow } from "@/lib/screener/measure";
import { SP500, SP500_SECTORS, CRYPTO, type UniverseEntry } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Five hundred sequential provider fetches is a rate-limit incident, so a scan
 * is scoped to a sector and the requests inside it run a few at a time. The
 * series cache does the rest: a second scan of the same sector is instant.
 */
const CONCURRENCY = 6;
const BENCHMARK = "SPY";

const RequestSchema = z.object({
  sector: z.string().max(40).optional(),
});

export interface ScreenerResponse {
  readonly rows: ScreenerRow[];
  readonly sector: string;
  readonly requested: number;
  /** Symbols the provider had nothing usable for. */
  readonly missing: string[];
  readonly benchmarkChange1y: number | null;
}

/** Runs `worker` over `items`, keeping at most `CONCURRENCY` in flight. */
async function pooled<T, R>(items: readonly T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function GET(request: Request): Promise<Response> {
  const parsed = RequestSchema.safeParse({
    sector: new URL(request.url).searchParams.get("sector") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid sector" }, { status: 400 });
  }

  const sector = parsed.data.sector ?? SP500_SECTORS[0];
  const universe: UniverseEntry[] =
    sector === "Crypto"
      ? [...CRYPTO]
      : SP500.filter((entry) => entry.sector === sector);

  if (universe.length === 0) {
    return Response.json({ error: `Unknown sector "${sector}"` }, { status: 404 });
  }

  // The benchmark's own year decides what "relative strength" is relative to.
  let benchmarkChange1y: number | null = null;
  try {
    const benchmark = await loadSeries(BENCHMARK, "1D");
    const closes = benchmark.bars.map((bar) => bar.close);
    if (closes.length > 252) {
      benchmarkChange1y = closes[closes.length - 1] / closes[closes.length - 1 - 252] - 1;
    }
  } catch {
    // A screen without relative strength is still a screen.
  }

  const missing: string[] = [];
  const measured = await pooled(universe, async (entry) => {
    try {
      const series = await loadSeries(entry.symbol, "1D");
      const row = measure(entry, series.bars, benchmarkChange1y);
      if (!row) missing.push(entry.symbol);
      return row;
    } catch (error) {
      // One delisted ticker must not take the whole sector down with it.
      if (!(error instanceof MarketDataError)) {
        console.error(`screener failed for ${entry.symbol}`, error);
      }
      missing.push(entry.symbol);
      return null;
    }
  });

  const rows = measured.filter((row): row is ScreenerRow => row !== null);

  return Response.json({
    rows,
    sector,
    requested: universe.length,
    missing,
    benchmarkChange1y,
  } satisfies ScreenerResponse);
}
