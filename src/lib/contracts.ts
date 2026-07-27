import { z } from "zod";
import { TIMEFRAMES } from "./market/timeframes";
import { RANKABLE_METRICS } from "./ranking";

export { TIMEFRAMES };
export type { Timeframe } from "./market/timeframes";

/** Covers tickers, indices (^GSPC), futures (GC=F), and FX pairs (EURUSD=X). */
export const SymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9.^=_-]+$/, "Symbol contains unsupported characters")
  .transform((value) => value.toUpperCase());

export const DirectionSchema = z.enum(["long", "short", "both"]);

export const BacktestRequestSchema = z.object({
  symbol: SymbolSchema,
  timeframe: z.enum(TIMEFRAMES),
  initialCapital: z.number().positive().finite().max(1_000_000_000),
  commissionBps: z.number().min(0).max(1_000).finite(),
  slippageBps: z.number().min(0).max(1_000).finite(),
  direction: DirectionSchema,
  /** Inclusive window bounds in unix seconds; omitted means the full available history. */
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  /** Share of the window treated as in-sample. 0 disables the split. */
  splitFraction: z.number().min(0).max(0.95).optional(),
  /** Fraction of equity committed per position. */
  positionSizePct: z.number().gt(0).max(1).optional(),
  stopLossPct: z.number().gt(0).max(0.9).optional(),
  takeProfitPct: z.number().gt(0).max(10).optional(),
  /** Optional per-strategy parameter overrides, keyed by strategy id. */
  parameters: z.record(z.string(), z.record(z.string(), z.number())).optional(),
})
  .refine((value) => value.start === undefined || value.end === undefined || value.start < value.end, {
    message: "Start must be earlier than end",
    path: ["start"],
  });

export type BacktestRequest = z.infer<typeof BacktestRequestSchema>;

export const MetricKeySchema = z.enum(RANKABLE_METRICS);

export const RankingCriterionSchema = z.object({
  metric: MetricKeySchema,
  enabled: z.boolean(),
  weight: z.number().min(0).max(100),
});

export const DEFAULT_REQUEST: BacktestRequest = {
  symbol: "QQQ",
  timeframe: "1D",
  initialCapital: 10_000,
  commissionBps: 10,
  slippageBps: 5,
  direction: "both",
  splitFraction: 0.7,
  positionSizePct: 1,
};
