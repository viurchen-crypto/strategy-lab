export interface PriceBar {
  time: string | number;
  open: number;
  close: number;
}

export type Position = -1 | 0 | 1;

export interface BacktestInput {
  bars: PriceBar[];
  targetPositions: Position[];
  initialCapital: number;
  commissionBps: number;
  slippageBps: number;
  periodsPerYear?: number;
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
}

interface OpenPosition {
  side: Exclude<Position, 0>;
  entryTime: string | number;
  entryPrice: number;
  quantity: number;
  entryCommission: number;
}

export function calculateSharpe(equity: number[], periodsPerYear: number): number {
  if (equity.length < 2) return 0;
  const returns = equity.slice(1).map((value, index) => value / equity[index] - 1);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const standardDeviation = Math.sqrt(variance);
  return standardDeviation === 0 ? 0 : (mean / standardDeviation) * Math.sqrt(periodsPerYear);
}

export function calculateMaxDrawdown(equity: number[]): number {
  let peak = 0;
  let maximum = 0;
  for (const value of equity) {
    peak = Math.max(peak, value);
    if (peak > 0) maximum = Math.max(maximum, (peak - value) / peak);
  }
  return maximum;
}

export function runBacktest(input: BacktestInput): BacktestResult {
  if (input.bars.length !== input.targetPositions.length) {
    throw new Error("bars and targetPositions must have equal lengths");
  }
  let cash = input.initialCapital;
  let position: OpenPosition | undefined;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];

  for (let index = 0; index < input.bars.length; index += 1) {
    const bar = input.bars[index];
    if (index > 0) {
      const target = input.targetPositions[index - 1];
      if (target !== (position?.side ?? 0)) {
        if (position) {
          const exitPrice = bar.open * (1 - position.side * input.slippageBps / 10_000);
          const grossPnl = position.side * (exitPrice - position.entryPrice) * position.quantity;
          const exitCommission = position.quantity * exitPrice * input.commissionBps / 10_000;
          cash += grossPnl - exitCommission;
          const pnl = grossPnl - position.entryCommission - exitCommission;
          trades.push({
            side: position.side === 1 ? "long" : "short",
            entryTime: position.entryTime,
            entryPrice: position.entryPrice,
            exitTime: bar.time,
            exitPrice,
            quantity: position.quantity,
            pnl,
            return: pnl / (position.entryPrice * position.quantity),
            commission: position.entryCommission + exitCommission,
          });
          position = undefined;
        }
        if (target !== 0) {
          const entryPrice = bar.open * (1 + target * input.slippageBps / 10_000);
          const quantity = cash / entryPrice;
          const entryCommission = quantity * entryPrice * input.commissionBps / 10_000;
          cash -= entryCommission;
          position = { side: target, entryTime: bar.time, entryPrice, quantity, entryCommission };
        }
      }
    }
    const markedEquity = position
      ? cash + position.side * (bar.close - position.entryPrice) * position.quantity
      : cash;
    equity.push({ time: bar.time, equity: markedEquity });
  }

  const finalEquity = equity.at(-1)?.equity ?? input.initialCapital;
  const equityValues = equity.map((point) => point.equity);
  return {
    initialCapital: input.initialCapital,
    finalEquity,
    netPnl: finalEquity - input.initialCapital,
    totalReturn: finalEquity / input.initialCapital - 1,
    sharpe: calculateSharpe(equityValues, input.periodsPerYear ?? 252),
    maxDrawdown: calculateMaxDrawdown(equityValues),
    equity,
    trades,
  };
}
