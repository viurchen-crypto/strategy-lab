import type { Bar } from "./bars";

export interface WindowSelection {
  /** Bars fed to the signal generators: the requested window plus its warm-up prefix. */
  readonly signalBars: readonly Bar[];
  /** Index into `signalBars` where the requested window — and the simulation — begins. */
  readonly windowStartIndex: number;
  /** True when the prefix was shorter than the requested warm-up. */
  readonly warmupTruncated: boolean;
}

export interface WindowRequest {
  /** Inclusive lower bound, unix seconds. */
  readonly start?: number;
  /** Inclusive upper bound, unix seconds. */
  readonly end?: number;
  /** Bars of history the slowest strategy needs before it can take a position. */
  readonly warmup: number;
}

/**
 * Selects the requested date window while keeping enough earlier history for
 * indicators to be warm at its first bar. Without the prefix a 2024→2025 window
 * would silently cost a 50/200 crossover its first 200 bars.
 */
export function selectWindow(bars: readonly Bar[], request: WindowRequest): WindowSelection {
  const warmup = Math.max(0, Math.floor(request.warmup));
  if (bars.length === 0) {
    return { signalBars: bars, windowStartIndex: 0, warmupTruncated: warmup > 0 };
  }

  const first = request.start === undefined ? 0 : bars.findIndex((bar) => bar.time >= request.start!);
  const windowStart = first < 0 ? bars.length : first;

  let windowEnd = bars.length; // exclusive
  if (request.end !== undefined) {
    windowEnd = bars.findIndex((bar) => bar.time > request.end!);
    if (windowEnd < 0) windowEnd = bars.length;
  }

  if (windowStart >= windowEnd) {
    return { signalBars: [], windowStartIndex: 0, warmupTruncated: warmup > 0 };
  }

  const prefixStart = Math.max(0, windowStart - warmup);
  return {
    signalBars: bars.slice(prefixStart, windowEnd),
    windowStartIndex: windowStart - prefixStart,
    warmupTruncated: windowStart - prefixStart < warmup,
  };
}
