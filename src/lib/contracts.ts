import { z } from "zod";

export const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1D", "1W", "1M"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const BacktestRequestSchema = z.object({
  symbol: z.string().trim().min(1).max(24).regex(/^[A-Za-z0-9.^=_-]+$/),
  timeframe: z.enum(TIMEFRAMES),
  strategyId: z.string().trim().min(1).max(80),
  initialCapital: z.number().positive().finite(),
  commissionBps: z.number().min(0).max(1_000).finite(),
  slippageBps: z.number().min(0).max(1_000).finite(),
  direction: z.enum(["long", "short", "both"]),
});

export type BacktestRequest = z.infer<typeof BacktestRequestSchema>;

export const MetricKeySchema = z.enum([
  "netPnl",
  "totalReturn",
  "sharpe",
  "sortino",
  "maxDrawdown",
  "calmar",
  "winRate",
  "profitFactor",
  "expectancy",
  "volatility",
  "turnover",
  "exposure",
  "tradeCount",
]);

export const RankingCriterionSchema = z.object({
  metric: MetricKeySchema,
  enabled: z.boolean(),
  weight: z.number().min(0).max(100),
});

export type RankingCriterion = z.infer<typeof RankingCriterionSchema>;

export const DEFAULT_RANKING: RankingCriterion[] = [
  { metric: "netPnl", enabled: true, weight: 1 },
  { metric: "sharpe", enabled: true, weight: 1 },
  { metric: "maxDrawdown", enabled: false, weight: 1 },
  { metric: "sortino", enabled: false, weight: 1 },
];
