import type { Position } from "../backtest";
import { defaultParameters, type StrategyMetadata } from "./catalog";
import {
  adxTrendSignals,
  atrChannelSignals,
  bollingerSignals,
  breakoutSignals,
  dualMomentumSignals,
  emaCrossoverSignals,
  envelopeSignals,
  macdSignals,
  momentumSignals,
  rsiSignals,
  smaCrossoverSignals,
  stochasticSignals,
  trendFilterSignals,
  volatilityFilteredTrendSignals,
  zScoreSignals,
  type SignalBar,
  type SignalSeries,
} from "./signals";

export type Direction = "long" | "short" | "both";

export class StrategyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyConfigError";
  }
}

/**
 * Clamps caller-supplied overrides into each parameter's declared range and
 * rounds to its step, so a hand-edited request can never reach a signal
 * function with an out-of-domain value.
 */
export function resolveParameters(
  strategy: StrategyMetadata,
  overrides: Record<string, number> = {},
): Record<string, number> {
  const resolved = defaultParameters(strategy);
  for (const parameter of strategy.parameters) {
    const candidate = overrides[parameter.key];
    if (candidate === undefined) continue;
    if (!Number.isFinite(candidate)) {
      throw new StrategyConfigError(`${parameter.label} must be a finite number`);
    }
    const clamped = Math.min(parameter.max, Math.max(parameter.min, candidate));
    resolved[parameter.key] = parameter.step >= 1 ? Math.round(clamped) : clamped;
  }
  if (
    (strategy.kind === "sma" || strategy.kind === "ema" || strategy.kind === "macd") &&
    resolved.fast >= resolved.slow
  ) {
    throw new StrategyConfigError("Fast average must be shorter than the slow average");
  }
  if (
    (strategy.kind === "rsi" || strategy.kind === "stochastic") &&
    resolved.lower >= resolved.upper
  ) {
    throw new StrategyConfigError("Oversold threshold must be below overbought");
  }
  return resolved;
}

/**
 * Dispatches a catalog entry to its signal generator. Bars are passed whole so
 * range-based rules can read highs and lows; close-only rules take the closes.
 */
export function generateSignals(
  strategy: StrategyMetadata,
  bars: readonly SignalBar[],
  parameters: Record<string, number>,
): SignalSeries {
  const closes = bars.map((bar) => bar.close);
  switch (strategy.kind) {
    case "sma":
      return smaCrossoverSignals(closes, parameters.fast, parameters.slow);
    case "ema":
      return emaCrossoverSignals(closes, parameters.fast, parameters.slow);
    case "trend-filter":
      return trendFilterSignals(closes, parameters.period);
    case "macd":
      return macdSignals(closes, parameters.fast, parameters.slow, parameters.signal);
    case "adx":
      return adxTrendSignals(bars, parameters.period, parameters.threshold);
    case "donchian":
      return breakoutSignals(closes, parameters.lookback);
    case "atr-channel":
      return atrChannelSignals(bars, parameters.period, parameters.multiple);
    case "momentum":
      return momentumSignals(closes, parameters.lookback);
    case "dual-momentum":
      return dualMomentumSignals(closes, parameters.lookback, parameters.trend);
    case "vol-trend":
      return volatilityFilteredTrendSignals(closes, parameters.trend, parameters.vol, parameters.maxVol);
    case "rsi":
      return rsiSignals(closes, parameters.period, parameters.lower, parameters.upper);
    case "stochastic":
      return stochasticSignals(bars, parameters.period, parameters.lower, parameters.upper);
    case "bollinger":
      return bollingerSignals(closes, parameters.period, parameters.deviations);
    case "zscore":
      return zScoreSignals(closes, parameters.period, parameters.threshold);
    case "envelope":
      return envelopeSignals(closes, parameters.period, parameters.band);
  }
}

/**
 * Converts raw signals into positions the engine can execute: warm-up nulls
 * become flat, and disallowed sides are held flat rather than inverted.
 */
export function toPositions(signals: SignalSeries, direction: Direction): Position[] {
  return signals.map((signal) => {
    if (signal === null || signal === 0) return 0;
    if (direction === "long") return signal === 1 ? 1 : 0;
    if (direction === "short") return signal === -1 ? -1 : 0;
    return signal;
  });
}
