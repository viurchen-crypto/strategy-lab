import { buildMetrics, type PerformanceMetrics } from "./metrics";

export interface PriceBar {
  time: string | number;
  open: number;
  close: number;
  /** Optional intrabar range. Without it a bar is treated as travelling only between open and close. */
  high?: number;
  low?: number;
}

export type Position = -1 | 0 | 1;

export type ExitReason = "signal" | "stop" | "target" | "end";

export interface BacktestInput {
  bars: readonly PriceBar[];
  targetPositions: readonly Position[];
  initialCapital: number;
  commissionBps: number;
  slippageBps: number;
  periodsPerYear?: number;
  /** Fraction of account equity committed to each position. 1 = all in. */
  positionSizePct?: number;
  /** Adverse move from the entry price that closes the position, as a fraction. */
  stopLossPct?: number;
  /** Favourable move from the entry price that closes the position, as a fraction. */
  takeProfitPct?: number;
}

export interface Trade {
  side: "long" | "short";
  entryTime: string | number;
  entryPrice: number;
  exitTime: string | number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  return: number;
  commission: number;
  exitReason: ExitReason;
}

export interface EquityPoint {
  time: string | number;
  equity: number;
}

export interface BacktestResult {
  initialCapital: number;
  finalEquity: number;
  netPnl: number;
  totalReturn: number;
  sharpe: number;
  maxDrawdown: number;
  equity: EquityPoint[];
  trades: Trade[];
  metrics: PerformanceMetrics;
}

interface OpenPosition {
  side: Exclude<Position, 0>;
  entryTime: string | number;
  entryPrice: number;
  quantity: number;
  entryCommission: number;
}

export { calculateMaxDrawdown, calculateSharpe } from "./metrics";

const barHigh = (bar: PriceBar): number => bar.high ?? Math.max(bar.open, bar.close);
const barLow = (bar: PriceBar): number => bar.low ?? Math.min(bar.open, bar.close);

/**
 * Deterministic long/short simulation. A signal observed on the close of bar
 * `i` is executed at the open of bar `i + 1`, so no decision ever uses a price
 * it could not have seen.
 *
 * Within a bar the order of events is open → intrabar range → close, so a
 * position opened at the open can be stopped out by the same bar's range. When
 * a bar touches both the stop and the target, the stop is assumed to have
 * filled first: the conservative reading, since the bar's path is unknown.
 */
export function runBacktest(input: BacktestInput): BacktestResult {
  if (input.bars.length !== input.targetPositions.length) {
    throw new Error("bars and targetPositions must have equal lengths");
  }
  const sizePct = input.positionSizePct ?? 1;
  if (!(sizePct > 0) || sizePct > 1) {
    throw new RangeError("positionSizePct must be within (0, 1]");
  }

  let cash = input.initialCapital;
  let position: OpenPosition | undefined;
  let exposedBars = 0;
  /**
   * Side a protective exit just closed. The same signal is not re-entered until
   * it changes, so a stop cannot be re-bought on the very next bar.
   */
  let blockedSide: Position = 0;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];

  const close = (
    open: OpenPosition,
    exitPrice: number,
    time: string | number,
    exitReason: ExitReason,
  ): void => {
    const grossPnl = open.side * (exitPrice - open.entryPrice) * open.quantity;
    const exitCommission = (open.quantity * exitPrice * input.commissionBps) / 10_000;
    cash += grossPnl - exitCommission;
    const pnl = grossPnl - open.entryCommission - exitCommission;
    trades.push({
      side: open.side === 1 ? "long" : "short",
      entryTime: open.entryTime,
      entryPrice: open.entryPrice,
      exitTime: time,
      exitPrice,
      quantity: open.quantity,
      pnl,
      return: pnl / (open.entryPrice * open.quantity),
      commission: open.entryCommission + exitCommission,
      exitReason,
    });
  };

  for (let index = 0; index < input.bars.length; index += 1) {
    const bar = input.bars[index];

    if (index > 0) {
      const target = input.targetPositions[index - 1];
      if (target !== blockedSide) blockedSide = 0;

      if (target !== (position?.side ?? 0)) {
        if (position) {
          const exitPrice = bar.open * (1 - (position.side * input.slippageBps) / 10_000);
          close(position, exitPrice, bar.time, "signal");
          position = undefined;
        }
        // A blown-up account cannot open the next position, and a side just
        // stopped out waits for the signal to change before re-entering.
        if (target !== 0 && target !== blockedSide && cash > 0) {
          const entryPrice: number = bar.open * (1 + (target * input.slippageBps) / 10_000);
          const quantity = (cash * sizePct) / entryPrice;
          const entryCommission = (quantity * entryPrice * input.commissionBps) / 10_000;
          cash -= entryCommission;
          position = { side: target, entryTime: bar.time, entryPrice, quantity, entryCommission };
        }
      }
    }

    if (position) {
      const protective = protectiveExit(position, bar, input.stopLossPct, input.takeProfitPct);
      if (protective) {
        const exitPrice = protective.price * (1 - (position.side * input.slippageBps) / 10_000);
        exposedBars += 1;
        close(position, exitPrice, bar.time, protective.reason);
        blockedSide = position.side;
        position = undefined;
      }
    }

    if (position) exposedBars += 1;
    const markedEquity = position
      ? cash + position.side * (bar.close - position.entryPrice) * position.quantity
      : cash;
    equity.push({ time: bar.time, equity: markedEquity });
  }

  // Liquidate whatever is still open at the last close, so an unfinished
  // position shows up in the trade statistics instead of only in the equity.
  const lastBar = input.bars.at(-1);
  if (position && lastBar) {
    const exitPrice = lastBar.close * (1 - (position.side * input.slippageBps) / 10_000);
    close(position, exitPrice, lastBar.time, "end");
    position = undefined;
    equity[equity.length - 1] = { time: lastBar.time, equity: cash };
  }

  const finalEquity = equity.at(-1)?.equity ?? input.initialCapital;
  const equityValues = equity.map((point) => point.equity);
  const metrics = buildMetrics({
    initialCapital: input.initialCapital,
    equity: equityValues,
    trades,
    exposure: input.bars.length === 0 ? 0 : exposedBars / input.bars.length,
    periodsPerYear: input.periodsPerYear ?? 252,
  });

  return {
    initialCapital: input.initialCapital,
    finalEquity,
    netPnl: metrics.netPnl,
    totalReturn: metrics.totalReturn,
    sharpe: metrics.sharpe,
    maxDrawdown: metrics.maxDrawdown,
    equity,
    trades,
    metrics,
  };
}

/**
 * Resolves the protective exit for a bar, if any. A gap through the level fills
 * at the open rather than the level itself, so a stop can never flatter a run.
 */
function protectiveExit(
  position: OpenPosition,
  bar: PriceBar,
  stopLossPct?: number,
  takeProfitPct?: number,
): { price: number; reason: ExitReason } | undefined {
  const high = barHigh(bar);
  const low = barLow(bar);

  if (stopLossPct && stopLossPct > 0) {
    const level = position.entryPrice * (1 - position.side * stopLossPct);
    const touched = position.side === 1 ? low <= level : high >= level;
    if (touched) {
      const price = position.side === 1 ? Math.min(level, bar.open) : Math.max(level, bar.open);
      return { price, reason: "stop" };
    }
  }

  if (takeProfitPct && takeProfitPct > 0) {
    const level = position.entryPrice * (1 + position.side * takeProfitPct);
    const touched = position.side === 1 ? high >= level : low <= level;
    if (touched) {
      const price = position.side === 1 ? Math.max(level, bar.open) : Math.min(level, bar.open);
      return { price, reason: "target" };
    }
  }

  return undefined;
}
