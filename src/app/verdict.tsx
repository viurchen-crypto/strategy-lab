import type { BacktestResponse, StrategyRun } from "@/lib/engine";
import {
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
  signClass,
} from "@/lib/format";

interface VerdictProps {
  data: BacktestResponse | null;
  strategy: (StrategyRun & { score?: number }) | undefined;
  /** True when `strategy` is also the top-ranked one, which changes the wording. */
  isLeader: boolean;
  loading: boolean;
}

/**
 * The answer, above the evidence.
 *
 * v1.1 opened on a ten-cell grid of ratios and left the reader to work out
 * whether any of it beat simply holding the thing. That is the one question a
 * backtest exists to answer, so it is now a sentence in plain English at the
 * top of the page, and the ratios stay where they belong — underneath.
 *
 * Every number here is already on the response; nothing is recomputed.
 */
export function Verdict({ data, strategy, isLeader, loading }: VerdictProps) {
  if (!data || !strategy) {
    return (
      <section className="verdict" aria-label="Run summary">
        <div className="verdict-headline">
          <span className="verdict-lead">{loading ? "Running" : "No result"}</span>
          <p className="verdict-title">
            {loading ? "Measuring twenty strategies…" : "Run a backtest to see a verdict."}
          </p>
        </div>
      </section>
    );
  }

  const { totalReturn, sharpe, maxDrawdown, tradeCount, netPnl } = strategy.metrics;
  const benchmark = data.benchmark.metrics.totalReturn;
  const edge = totalReturn - benchmark;
  const warnings = strategy.warnings ?? [];

  // Amber for "measured, but do not lean on it", red for a loss, accent otherwise.
  const tone = totalReturn <= 0 ? "is-loss" : warnings.length > 0 ? "is-caution" : "";

  return (
    <section className={`verdict ${tone}`.trim()} aria-label="Run summary">
      <div className="verdict-headline">
        <span className="verdict-lead">
          {isLeader ? "Best of 20" : "Selected"} · {data.symbol} {data.timeframe} · {data.barCount}{" "}
          bars
        </span>
        <p className="verdict-title">
          {strategy.name} returned{" "}
          <b className={signClass(totalReturn)}>{formatSignedPercent(totalReturn, 1)}</b> where buy
          &amp; hold returned <b className={signClass(benchmark)}>{formatSignedPercent(benchmark, 1)}</b>
        </p>
        <p className="verdict-sub">
          {describe(edge, strategy, netPnl, data.currency)}
        </p>
      </div>

      <div className="verdict-stats">
        <Stat label="Return" value={formatSignedPercent(totalReturn, 1)} tone={totalReturn} />
        <Stat label="Sharpe" value={formatNumber(sharpe)} tone={sharpe} />
        <Stat label="Max DD" value={`-${formatPercent(maxDrawdown, 1)}`} tone={-1} />
        <Stat label="Trades" value={String(tradeCount)} />
      </div>

      <div className="verdict-flags">
        {warnings.length === 0 ? (
          <span className="flag ok">✓ No caveats flagged</span>
        ) : (
          warnings.map((warning) => (
            <span className="flag" key={warning} title={warning}>
              ⚠ {shorten(warning)}
            </span>
          ))
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone === undefined ? "" : signClass(tone)}`}>{value}</span>
    </div>
  );
}

/**
 * One sentence of context, chosen by what is most worth saying about this run:
 * a collapsed out-of-sample half beats a paragraph about the edge over holding.
 */
function describe(
  edge: number,
  strategy: StrategyRun,
  netPnl: number,
  currency: string,
): string {
  const money = `${formatSignedCurrency(netPnl, currency)} on the account`;

  if (strategy.outOfSample && strategy.inSample) {
    const held = strategy.outOfSample.sharpe >= strategy.inSample.sharpe * 0.5;
    return held
      ? `${money}. It held up out of sample — Sharpe ${formatNumber(
          strategy.inSample.sharpe,
        )} in sample against ${formatNumber(strategy.outOfSample.sharpe)} on data it never saw.`
      : `${money}. Out of sample its Sharpe fell from ${formatNumber(
          strategy.inSample.sharpe,
        )} to ${formatNumber(strategy.outOfSample.sharpe)}, which is what an overfit rule looks like.`;
  }

  if (edge > 0) {
    return `${money}, beating buy & hold by ${formatPercent(Math.abs(edge), 1)} over the same bars and costs.`;
  }
  return `${money}, trailing buy & hold by ${formatPercent(Math.abs(edge), 1)} over the same bars and costs.`;
}

/** Flags sit on one line; the full text stays in the title and in the panel below. */
const shorten = (warning: string): string =>
  warning.length <= 46 ? warning : `${warning.slice(0, 44).trimEnd()}…`;
