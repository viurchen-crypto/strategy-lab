import { aggregateBars, type Bar, type Series } from "./bars";
import { TIMEFRAME_CONFIG, type Timeframe } from "./timeframes";

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

/** Yahoo rejects requests without a browser-like agent. */
const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; StrategyLab/1.0; +https://strategy-lab-two.vercel.app)",
  Accept: "application/json",
};

export class MarketDataError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MarketDataError";
  }
}

interface YahooQuote {
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
  volume?: (number | null)[];
}

interface YahooResult {
  meta?: {
    symbol?: string;
    shortName?: string;
    longName?: string;
    currency?: string;
    fullExchangeName?: string;
    instrumentType?: string;
  };
  timestamp?: number[];
  indicators?: { quote?: YahooQuote[] };
}

interface YahooResponse {
  chart?: {
    result?: YahooResult[] | null;
    error?: { code?: string; description?: string } | null;
  };
}

function toBars(result: YahooResult): Bar[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const time = timestamps[index];
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    // Yahoo pads holidays and halted sessions with nulls; those bars are dropped
    // rather than forward-filled so no synthetic prices reach the engine.
    if (
      !Number.isFinite(time) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    bars.push({
      time,
      open: open as number,
      high: high as number,
      low: low as number,
      close: close as number,
      volume: Number.isFinite(quote.volume?.[index]) ? (quote.volume?.[index] as number) : 0,
    });
  }
  // Guard against the provider ever returning unordered or duplicated stamps.
  bars.sort((a, b) => a.time - b.time);
  return bars.filter((bar, index) => index === 0 || bar.time !== bars[index - 1].time);
}

async function requestChart(symbol: string, interval: string, range: string): Promise<YahooResult> {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  let lastError: MarketDataError | undefined;

  for (const host of HOSTS) {
    let response: Response;
    try {
      response = await fetch(host + path, { headers: REQUEST_HEADERS, cache: "no-store" });
    } catch {
      lastError = new MarketDataError("Market data provider is unreachable", 502);
      continue;
    }

    if (!response.ok) {
      lastError = new MarketDataError(
        response.status === 404
          ? `Unknown symbol "${symbol}"`
          : `Market data provider returned ${response.status}`,
        response.status === 404 ? 404 : 502,
      );
      continue;
    }

    const payload = (await response.json()) as YahooResponse;
    const error = payload.chart?.error;
    if (error) {
      const notFound = error.code === "Not Found";
      throw new MarketDataError(
        notFound ? `Unknown symbol "${symbol}"` : (error.description ?? "Market data request failed"),
        notFound ? 404 : 502,
      );
    }
    const result = payload.chart?.result?.[0];
    if (!result) throw new MarketDataError(`No data returned for "${symbol}"`, 404);
    return result;
  }

  throw lastError ?? new MarketDataError("Market data request failed", 502);
}

export async function fetchSeries(symbol: string, timeframe: Timeframe): Promise<Series> {
  const config = TIMEFRAME_CONFIG[timeframe];
  const result = await requestChart(symbol, config.providerInterval, config.providerRange);
  const raw = toBars(result);
  const bars = config.bucketSeconds ? aggregateBars(raw, config.bucketSeconds) : raw;

  if (bars.length < 2) {
    throw new MarketDataError(`Not enough ${timeframe} history for "${symbol}"`, 422);
  }

  const meta = result.meta ?? {};
  return {
    meta: {
      symbol: meta.symbol ?? symbol,
      name: meta.longName ?? meta.shortName ?? symbol,
      currency: meta.currency ?? "USD",
      exchange: meta.fullExchangeName ?? "—",
      instrumentType: meta.instrumentType ?? "—",
    },
    bars,
  };
}
