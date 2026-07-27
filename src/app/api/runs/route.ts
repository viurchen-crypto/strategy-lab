import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
/** Run history changes with every backtest, so it must never be prerendered. */
export const dynamic = "force-dynamic";

export interface RunHistoryRow {
  readonly runId: string;
  readonly createdAt: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly direction: string;
  /** Highest-scoring strategy of that run. */
  readonly leaderId: string;
  readonly leaderReturn: number;
  readonly leaderSharpe: number;
  readonly strategyCount: number;
}

export interface RunHistoryResponse {
  readonly runs: RunHistoryRow[];
  readonly configured: boolean;
}

/** One backtest writes a row per strategy, so the row budget covers ~15 runs. */
const ROW_LIMIT = 320;
const RUN_LIMIT = 12;

export async function GET(): Promise<Response> {
  const database = getDatabase();
  // Without credentials the app still works; it simply has no history to show.
  if (!database) return Response.json({ runs: [], configured: false } satisfies RunHistoryResponse);

  const { data, error } = await database
    .from("backtest_runs")
    .select("run_id, created_at, symbol, timeframe, direction, strategy_id, score, metrics")
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    console.error("run history unavailable", error);
    return Response.json({ runs: [], configured: true } satisfies RunHistoryResponse);
  }

  // Rows arrive one per strategy; collapse each batch to its best-scoring entry.
  const byRun = new Map<string, { row: RunHistoryRow; bestScore: number }>();
  for (const record of data ?? []) {
    const metrics = (record.metrics ?? {}) as Record<string, number>;
    const runId = (record.run_id as string | null) ?? (record.created_at as string);
    const score = Number(record.score ?? Number.NEGATIVE_INFINITY);
    const entry = byRun.get(runId);

    if (!entry) {
      byRun.set(runId, {
        bestScore: score,
        row: {
          runId,
          createdAt: record.created_at as string,
          symbol: record.symbol as string,
          timeframe: record.timeframe as string,
          direction: record.direction as string,
          leaderId: record.strategy_id as string,
          leaderReturn: metrics.totalReturn ?? 0,
          leaderSharpe: metrics.sharpe ?? 0,
          strategyCount: 1,
        },
      });
      continue;
    }

    entry.row = {
      ...entry.row,
      strategyCount: entry.row.strategyCount + 1,
      ...(score > entry.bestScore
        ? {
            leaderId: record.strategy_id as string,
            leaderReturn: metrics.totalReturn ?? 0,
            leaderSharpe: metrics.sharpe ?? 0,
          }
        : {}),
    };
    entry.bestScore = Math.max(entry.bestScore, score);
  }

  return Response.json({
    runs: [...byRun.values()].slice(0, RUN_LIMIT).map((entry) => entry.row),
    configured: true,
  } satisfies RunHistoryResponse);
}
