import type { PerformanceMetrics } from "./metrics";

export const RANKABLE_METRICS = [
  "netPnl",
  "totalReturn",
  "cagr",
  "sharpe",
  "sortino",
  "calmar",
  "maxDrawdown",
  "volatility",
  "winRate",
  "profitFactor",
  "expectancy",
] as const;

export type RankableMetric = (typeof RANKABLE_METRICS)[number];

/** Metrics where a smaller value is the better outcome. */
const LOWER_IS_BETTER = new Set<RankableMetric>(["maxDrawdown", "volatility"]);

export const METRIC_LABELS: Record<RankableMetric, string> = {
  netPnl: "P&L",
  totalReturn: "RETURN",
  cagr: "CAGR",
  sharpe: "SHARPE",
  sortino: "SORTINO",
  calmar: "CALMAR",
  maxDrawdown: "MAX DD",
  volatility: "VOL",
  winRate: "WIN%",
  profitFactor: "PF",
  expectancy: "EXP",
};

export interface RankingCriterion {
  readonly metric: RankableMetric;
  readonly enabled: boolean;
  readonly weight: number;
}

export const DEFAULT_RANKING: readonly RankingCriterion[] = [
  { metric: "totalReturn", enabled: true, weight: 1 },
  { metric: "sharpe", enabled: true, weight: 1 },
  { metric: "maxDrawdown", enabled: true, weight: 1 },
  { metric: "calmar", enabled: false, weight: 1 },
  { metric: "winRate", enabled: false, weight: 1 },
  { metric: "profitFactor", enabled: false, weight: 1 },
];

export interface Rankable {
  readonly metrics: PerformanceMetrics;
}

/**
 * Scores each candidate 0–100 by min-max normalizing every enabled metric
 * across the candidate set, orienting it so higher always means better, then
 * taking the weighted mean. Scores are therefore relative to the current run.
 */
export function scoreCandidates<T extends Rankable>(
  candidates: readonly T[],
  criteria: readonly RankingCriterion[],
): number[] {
  const active = criteria.filter((criterion) => criterion.enabled && criterion.weight > 0);
  if (candidates.length === 0) return [];
  if (active.length === 0 || candidates.length === 1) return candidates.map(() => 100);

  const totalWeight = active.reduce((sum, criterion) => sum + criterion.weight, 0);

  return candidates.map((candidate) => {
    let score = 0;
    for (const criterion of active) {
      const values = candidates.map((other) => other.metrics[criterion.metric]);
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const value = candidate.metrics[criterion.metric];
      // A metric that is identical across candidates cannot separate them.
      const normalized = maximum === minimum ? 0.5 : (value - minimum) / (maximum - minimum);
      const oriented = LOWER_IS_BETTER.has(criterion.metric) ? 1 - normalized : normalized;
      score += oriented * criterion.weight;
    }
    return (score / totalWeight) * 100;
  });
}
