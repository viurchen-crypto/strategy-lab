"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunHistoryResponse, RunHistoryRow } from "@/app/api/runs/route";
import { DEFAULT_REQUEST, TIMEFRAMES, type Timeframe } from "@/lib/contracts";
import type { BacktestResponse, StrategyRun } from "@/lib/engine";
import {
  formatNumber,
  formatPercent,
  formatPrice,
  formatRelative,
  formatSignedCurrency,
  formatSignedPercent,
  formatTimestamp,
  isIntraday,
  signClass,
} from "@/lib/format";
import { INSTRUMENTS } from "@/lib/instruments";
import { buildMetrics } from "@/lib/metrics";
import {
  DEFAULT_RANKING,
  METRIC_LABELS,
  scoreCandidates,
  type RankableMetric,
  type RankingCriterion,
} from "@/lib/ranking";
import { STRATEGY_CATALOG } from "@/lib/strategies/catalog";
import { runCommand, type TerminalConfig } from "@/lib/terminal/commands";
import { Playback } from "./playback";
import { PriceChart } from "./price-chart";
import { Terminal, type TerminalLine } from "./terminal";

const INITIAL_CONFIG: TerminalConfig = {
  symbol: DEFAULT_REQUEST.symbol,
  timeframe: DEFAULT_REQUEST.timeframe,
  capital: DEFAULT_REQUEST.initialCapital,
  commissionBps: DEFAULT_REQUEST.commissionBps,
  slippageBps: DEFAULT_REQUEST.slippageBps,
  direction: DEFAULT_REQUEST.direction,
  positionSizePct: 1,
  splitFraction: 0.7,
};

const WELCOME: TerminalLine[] = [
  { id: 0, tone: "note", text: "Strategy Lab terminal · 20 published strategies on real historical data" },
  { id: 1, tone: "note", text: "Type help for the command list. Tab completes, ↑ recalls." },
];

function Panel({
  title,
  meta,
  className,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`panel ${className ?? ""}`}>
      <header className="panel-title">
        <span>[ {title} ]</span>
        {meta ? <span className="panel-meta">{meta}</span> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Dashboard() {
  const [config, setConfig] = useState<TerminalConfig>(INITIAL_CONFIG);
  const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({});
  const [data, setData] = useState<BacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>(STRATEGY_CATALOG[0].id);
  const [criteria, setCriteria] = useState<RankingCriterion[]>([...DEFAULT_RANKING]);
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [lines, setLines] = useState<TerminalLine[]>(WELCOME);
  const [history, setHistory] = useState<RunHistoryRow[] | null>(null);
  const requestId = useRef(0);
  const lineId = useRef(WELCOME.length);

  const print = useCallback((tone: TerminalLine["tone"], text: string | string[]) => {
    const texts = Array.isArray(text) ? text : [text];
    setLines((previous) => [
      ...previous,
      ...texts.map((entry) => ({ id: (lineId.current += 1), tone, text: entry })),
    ].slice(-300));
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/runs");
      const payload = (await response.json()) as RunHistoryResponse;
      setHistory(payload.runs);
      return payload;
    } catch {
      setHistory([]);
      return { runs: [], configured: false } satisfies RunHistoryResponse;
    }
  }, []);

  const run = useCallback(
    async (next: TerminalConfig, parameters: Record<string, Record<string, number>>) => {
      const id = (requestId.current += 1);
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/backtest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: next.symbol,
            timeframe: next.timeframe,
            initialCapital: next.capital,
            commissionBps: next.commissionBps,
            slippageBps: next.slippageBps,
            direction: next.direction,
            positionSizePct: next.positionSizePct,
            stopLossPct: next.stopLossPct,
            takeProfitPct: next.takeProfitPct,
            splitFraction: next.splitFraction,
            start: next.start,
            end: next.end,
            parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
          }),
        });
        const payload = await response.json();
        // Ignore results from a run the user has already superseded.
        if (id !== requestId.current) return;
        if (!response.ok) {
          setError(payload?.error ?? `Request failed (${response.status})`);
          print("error", payload?.error ?? `Request failed (${response.status})`);
          return;
        }
        const result = payload as BacktestResponse;
        setData(result);
        setCursor(result.bars.length - 1);
        print(
          "output",
          `${result.symbol} ${result.timeframe} · ${result.barCount} bars · ${formatTimestamp(
            result.periodStart,
          )} → ${formatTimestamp(result.periodEnd)} · ${result.source}`,
        );
        void loadHistory();
      } catch {
        if (id === requestId.current) {
          setError("Could not reach the backtest service");
          print("error", "Could not reach the backtest service");
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [print, loadHistory],
  );

  useEffect(() => {
    // Deferred by a tick so the first backtest starts after the first paint
    // instead of cascading a render out of the mount effect.
    const timer = setTimeout(() => {
      void run(INITIAL_CONFIG, {});
      void loadHistory();
    });
    return () => clearTimeout(timer);
  }, [run, loadHistory]);

  const barCount = data?.bars.length ?? 0;
  const atEnd = cursor >= barCount - 1;

  /**
   * Metrics as of the playback cursor. At the end of the window this is exactly
   * what the server returned; mid-playback it is recomputed from the visible
   * slice so every panel agrees with the chart.
   */
  const visible = useMemo(() => {
    if (!data) return [];
    if (atEnd) return data.strategies;
    const cutoff = data.bars[cursor]?.[0] ?? Number.POSITIVE_INFINITY;
    return data.strategies.map((strategy) => {
      const equity = strategy.equity.slice(0, cursor + 1);
      const trades = strategy.trades.filter((trade) => trade.exitTime <= cutoff);
      return {
        ...strategy,
        equity,
        trades,
        metrics: buildMetrics({
          // equity[0] is the account at the first bar, i.e. the starting capital.
          initialCapital: strategy.equity[0] ?? 0,
          equity,
          trades,
          exposure: strategy.metrics.exposure,
          periodsPerYear: data.periodsPerYear,
        }),
      };
    });
  }, [data, cursor, atEnd]);

  // Ranking is relative to the current run, so re-scoring on toggle needs no refetch.
  const ranked = useMemo(() => {
    if (visible.length === 0) return [];
    const scores = scoreCandidates(visible, criteria);
    return visible
      .map((strategy, index) => ({ ...strategy, score: Math.round(scores[index] * 10) / 10 }))
      .sort((a, b) => b.score - a.score);
  }, [visible, criteria]);

  const selected: StrategyRun | undefined = useMemo(
    () => ranked.find((strategy) => strategy.id === selectedId) ?? ranked[0],
    [ranked, selectedId],
  );

  const selectedMeta = STRATEGY_CATALOG.find((strategy) => strategy.id === selected?.id);
  const intraday = data ? isIntraday(data.timeframe) : false;
  const lastClose = data?.bars[Math.min(cursor, barCount - 1)]?.[4];

  const update = <K extends keyof TerminalConfig>(key: K, value: TerminalConfig[K]) =>
    setConfig((previous) => ({ ...previous, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(config, overrides);
  };

  const setParameter = (strategyId: string, key: string, value: number) =>
    setOverrides((previous) => ({
      ...previous,
      [strategyId]: { ...previous[strategyId], [key]: value },
    }));

  const exportCsv = useCallback(() => {
    if (!selected || !data) return;
    const rows = [
      "side,entry_time,entry_price,exit_time,exit_price,pnl,return,exit_reason",
      ...selected.trades.map((trade) =>
        [
          trade.side,
          formatTimestamp(trade.entryTime, intraday),
          trade.entryPrice,
          formatTimestamp(trade.exitTime, intraday),
          trade.exitPrice,
          trade.pnl,
          trade.return,
          trade.exitReason,
        ].join(","),
      ),
    ].join("\n");

    const url = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.symbol}-${data.timeframe}-${selected.id}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    print("output", `Exported ${selected.trades.length} trades`);
  }, [selected, data, intraday, print]);

  const onCommand = useCallback(
    (raw: string) => {
      print("input", raw);
      const result = runCommand(raw, config);
      if (result.lines.length > 0) {
        print(result.kind === "error" ? "error" : "output", result.lines);
      }

      switch (result.kind) {
        case "config":
          setConfig(result.config);
          if (result.rerun) void run(result.config, overrides);
          break;

        case "ranking":
          setCriteria((previous) =>
            previous.map((criterion) => ({
              ...criterion,
              enabled: result.metrics.includes(criterion.metric),
            })),
          );
          break;

        case "select":
          setSelectedId(result.strategyId);
          break;

        case "parameter": {
          const next = {
            ...overrides,
            [result.strategyId]: { ...overrides[result.strategyId], [result.key]: result.value },
          };
          setOverrides(next);
          void run(config, next);
          break;
        }

        case "query": {
          if (!data || ranked.length === 0) {
            print("error", "Nothing to show yet — run a backtest first");
            break;
          }
          if (result.query === "top") {
            print(
              "output",
              ranked.slice(0, result.count ?? 5).map((strategy, index) =>
                `${String(index + 1).padStart(2, " ")} ${strategy.name.padEnd(26)} ${formatSignedPercent(
                  strategy.metrics.totalReturn,
                  1,
                ).padStart(9)}  sharpe ${formatNumber(strategy.metrics.sharpe)}  score ${formatNumber(
                  strategy.score,
                  1,
                )}`,
              ),
            );
          } else if (result.query === "trades") {
            const trades = [...(selected?.trades ?? [])].reverse().slice(0, result.count ?? 10);
            print(
              "output",
              trades.length === 0
                ? ["No trades in this window"]
                : trades.map(
                    (trade) =>
                      `${formatTimestamp(trade.entryTime, intraday)} ${trade.side.toUpperCase().padEnd(5)} ` +
                      `${formatPrice(trade.entryPrice)} → ${formatPrice(trade.exitPrice)}  ` +
                      `${formatSignedCurrency(trade.pnl, data.currency)}  (${trade.exitReason})`,
                  ),
            );
          } else if (selected) {
            print("output", [
              `${selected.name}`,
              `return ${formatSignedPercent(selected.metrics.totalReturn)} · sharpe ${formatNumber(
                selected.metrics.sharpe,
              )} · sortino ${formatNumber(selected.metrics.sortino)} · maxDD ${formatPercent(
                selected.metrics.maxDrawdown,
              )}`,
              `trades ${selected.metrics.tradeCount} · win ${formatPercent(
                selected.metrics.winRate,
                1,
              )} · profit factor ${formatNumber(selected.metrics.profitFactor)} · exposure ${formatPercent(
                selected.metrics.exposure,
                1,
              )}`,
              ...(selected.warnings ?? []).map((warning) => `! ${warning}`),
            ]);
          }
          break;
        }

        case "action":
          if (result.action === "clear") setLines([]);
          if (result.action === "export") exportCsv();
          if (result.action === "history") {
            void loadHistory().then((payload) =>
              print(
                payload.configured ? "output" : "error",
                payload.runs.length > 0
                  ? payload.runs.map(
                      (entry) =>
                        `${formatRelative(entry.createdAt).padStart(8)}  ${entry.symbol} ${entry.timeframe}` +
                        `  best ${entry.leaderId} ${formatSignedPercent(entry.leaderReturn, 1)}`,
                    )
                  : [payload.configured ? "No runs recorded yet" : "Run history is not configured"],
              ),
            );
          }
          break;

        default:
          break;
      }
    },
    [config, overrides, run, print, data, ranked, selected, intraday, exportCsv, loadHistory],
  );

  const notes = data?.notes ?? [];
  const warnings = selected?.warnings ?? [];

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="prompt">❯</span>
          <h1>STRATEGY LAB</h1>
          <span className="version">v1.1</span>
        </div>
        <div className="status">
          {data ? (
            <>
              <span>
                {data.symbol} <span className="muted">{data.exchange}</span>
              </span>
              <span>
                {data.barCount} BARS · {formatTimestamp(data.periodStart)} →{" "}
                {formatTimestamp(data.periodEnd)}
              </span>
              <span className={loading ? "pending" : "online"}>
                ● {loading ? "RUNNING" : `${data.source.toUpperCase()} ${formatRelative(data.fetchedAt)}`}
              </span>
            </>
          ) : (
            <span className="pending">● CONNECTING</span>
          )}
        </div>
      </header>

      <form className="commandbar" onSubmit={submit}>
        <label>
          SYMBOL
          <input
            aria-label="Symbol"
            list="instruments"
            value={config.symbol}
            spellCheck={false}
            onChange={(event) => update("symbol", event.target.value.toUpperCase())}
          />
        </label>
        <datalist id="instruments">
          {INSTRUMENTS.map((instrument) => (
            <option key={instrument.symbol} value={instrument.symbol}>
              {instrument.label}
            </option>
          ))}
        </datalist>

        <div className="timeframes" role="group" aria-label="Timeframe">
          {TIMEFRAMES.map((timeframe) => (
            <button
              type="button"
              key={timeframe}
              className={timeframe === config.timeframe ? "active" : ""}
              onClick={() => {
                const next = { ...config, timeframe: timeframe as Timeframe };
                setConfig(next);
                void run(next, overrides);
              }}
            >
              {timeframe}
            </button>
          ))}
        </div>

        <label>
          CAPITAL
          <input
            aria-label="Initial capital"
            type="number"
            min="1"
            step="100"
            value={config.capital}
            onChange={(event) => update("capital", Number(event.target.value))}
          />
        </label>
        <label>
          FEE bps
          <input
            aria-label="Commission in basis points"
            type="number"
            min="0"
            max="1000"
            step="1"
            value={config.commissionBps}
            onChange={(event) => update("commissionBps", Number(event.target.value))}
          />
        </label>
        <label>
          SLIP bps
          <input
            aria-label="Slippage in basis points"
            type="number"
            min="0"
            max="1000"
            step="1"
            value={config.slippageBps}
            onChange={(event) => update("slippageBps", Number(event.target.value))}
          />
        </label>
        <label>
          SIZE %
          <input
            aria-label="Position size percent"
            type="number"
            min="1"
            max="100"
            step="1"
            value={Math.round(config.positionSizePct * 100)}
            onChange={(event) =>
              update("positionSizePct", Math.min(100, Math.max(1, Number(event.target.value))) / 100)
            }
          />
        </label>
        <label>
          STOP %
          <input
            aria-label="Stop loss percent"
            type="number"
            min="0"
            max="90"
            step="0.5"
            value={config.stopLossPct === undefined ? 0 : Math.round(config.stopLossPct * 1_000) / 10}
            onChange={(event) => {
              const value = Number(event.target.value);
              update("stopLossPct", value > 0 ? value / 100 : undefined);
            }}
          />
        </label>
        <label>
          SIDE
          <select
            aria-label="Direction"
            value={config.direction}
            onChange={(event) =>
              update("direction", event.target.value as TerminalConfig["direction"])
            }
          >
            <option value="both">LONG+SHORT</option>
            <option value="long">LONG ONLY</option>
            <option value="short">SHORT ONLY</option>
          </select>
        </label>

        <button className="run" type="submit" disabled={loading}>
          {loading ? "▶ RUNNING…" : "▶ RUN BACKTEST"}
        </button>
      </form>

      {error ? (
        <p className="alert" role="alert">
          ! {error}
        </p>
      ) : null}
      {notes.map((note) => (
        <p className="note-strip" key={note}>
          ⚠ {note}
        </p>
      ))}

      <div className="dashboard-grid">
        <Panel title="STRATEGIES" meta={`${STRATEGY_CATALOG.length}`} className="catalog">
          <div className="strategy-list">
            {ranked.map((strategy) => (
              <button
                type="button"
                key={strategy.id}
                className={strategy.id === selected?.id ? "strategy selected" : "strategy"}
                onClick={() => setSelectedId(strategy.id)}
              >
                <span className="rank">{strategy.code}</span>
                <span className="strategy-name">{strategy.name}</span>
                <span className={signClass(strategy.metrics.totalReturn)}>
                  {formatSignedPercent(strategy.metrics.totalReturn, 1)}
                </span>
              </button>
            ))}
            {ranked.length === 0 ? <p className="empty">Awaiting first run…</p> : null}
          </div>
          <button
            type="button"
            className="new-strategy"
            onClick={() => print("note", "Describe a new rule in the terminal below, then press ↵.")}
          >
            + NEW STRATEGY
          </button>
        </Panel>

        <Panel
          title="MARKET PLAYBACK"
          meta={
            data && lastClose !== undefined ? (
              <>
                {data.symbol} · {data.timeframe} · {formatPrice(lastClose)} {data.currency}
                <button
                  type="button"
                  className={showBenchmark ? "toggle on" : "toggle"}
                  onClick={() => setShowBenchmark((value) => !value)}
                >
                  BUY&HOLD
                </button>
              </>
            ) : null
          }
          className="market"
        >
          {data && selected ? (
            <>
              <PriceChart
                bars={data.bars}
                strategy={data.strategies.find(({ id }) => id === selected.id) ?? selected}
                benchmarkEquity={data.benchmark.equity}
                timeframe={data.timeframe}
                showBenchmark={showBenchmark}
                cursor={cursor}
                splitIndex={data.splitIndex}
              />
              <Playback
                barCount={barCount}
                cursor={cursor}
                onCursor={setCursor}
                label={formatTimestamp(data.bars[Math.min(cursor, barCount - 1)][0], intraday)}
              />
            </>
          ) : (
            <p className="empty">{error ? "No data" : "Loading market data…"}</p>
          )}
        </Panel>

        <Panel title="PERFORMANCE" meta={selected?.name} className="performance">
          {selected ? (
            <>
              <div className="metrics">
                <Metric label="NET P&L" value={formatSignedCurrency(selected.metrics.netPnl, data?.currency)} tone={selected.metrics.netPnl} />
                <Metric label="RETURN" value={formatSignedPercent(selected.metrics.totalReturn)} tone={selected.metrics.totalReturn} />
                <Metric label="CAGR" value={formatSignedPercent(selected.metrics.cagr)} tone={selected.metrics.cagr} />
                <Metric label="SHARPE" value={formatNumber(selected.metrics.sharpe)} tone={selected.metrics.sharpe} />
                <Metric label="SORTINO" value={formatNumber(selected.metrics.sortino)} tone={selected.metrics.sortino} />
                <Metric label="MAX DD" value={`-${formatPercent(selected.metrics.maxDrawdown)}`} tone={-1} />
                <Metric label="WIN RATE" value={formatPercent(selected.metrics.winRate, 1)} />
                <Metric label="PROFIT FACTOR" value={formatNumber(selected.metrics.profitFactor)} tone={selected.metrics.profitFactor - 1} />
                <Metric label="TRADES" value={String(selected.metrics.tradeCount)} />
                <Metric label="EXPOSURE" value={formatPercent(selected.metrics.exposure, 1)} />
              </div>

              {selected.inSample && selected.outOfSample ? (
                <div className="split-metrics">
                  <div className="split-head">
                    <span>IN-SAMPLE</span>
                    <span>OUT-OF-SAMPLE</span>
                  </div>
                  <div className="split-row">
                    <span className="muted">RETURN</span>
                    <b className={signClass(selected.inSample.totalReturn)}>
                      {formatSignedPercent(selected.inSample.totalReturn, 1)}
                    </b>
                    <b className={signClass(selected.outOfSample.totalReturn)}>
                      {formatSignedPercent(selected.outOfSample.totalReturn, 1)}
                    </b>
                  </div>
                  <div className="split-row">
                    <span className="muted">SHARPE</span>
                    <b>{formatNumber(selected.inSample.sharpe)}</b>
                    <b>{formatNumber(selected.outOfSample.sharpe)}</b>
                  </div>
                </div>
              ) : null}

              {warnings.map((warning) => (
                <p className="warning" key={warning}>
                  ⚠ {warning}
                </p>
              ))}

              {data ? (
                <p className="benchmark-note">
                  Buy &amp; hold over the same window:{" "}
                  <b className={signClass(data.benchmark.metrics.totalReturn)}>
                    {formatSignedPercent(data.benchmark.metrics.totalReturn)}
                  </b>{" "}
                  · Sharpe {formatNumber(data.benchmark.metrics.sharpe)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="empty">—</p>
          )}
        </Panel>

        <Panel title="PARAMETERS" meta={selected?.code} className="params">
          {selectedMeta && selected ? (
            <>
              <p className="description">{selectedMeta.description}</p>
              <div className="param-list">
                {selectedMeta.parameters.map((parameter) => (
                  <label key={parameter.key}>
                    <span>{parameter.label}</span>
                    <input
                      type="number"
                      min={parameter.min}
                      max={parameter.max}
                      step={parameter.step}
                      value={overrides[selectedMeta.id]?.[parameter.key] ?? selected.parameters[parameter.key] ?? parameter.value}
                      onChange={(event) =>
                        setParameter(selectedMeta.id, parameter.key, Number(event.target.value))
                      }
                    />
                  </label>
                ))}
              </div>
              {selected.error ? <p className="alert inline">! {selected.error}</p> : null}
              <div className="param-actions">
                <button type="button" onClick={() => void run(config, overrides)} disabled={loading}>
                  APPLY &amp; RERUN
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const reset = { ...overrides };
                    delete reset[selectedMeta.id];
                    setOverrides(reset);
                    void run(config, reset);
                  }}
                >
                  RESET
                </button>
                <button type="button" className="ghost" onClick={exportCsv}>
                  EXPORT CSV
                </button>
              </div>
              <a className="evidence" href={selectedMeta.evidence.url} target="_blank" rel="noreferrer">
                ↗ {selectedMeta.evidence.title}
              </a>
            </>
          ) : (
            <p className="empty">—</p>
          )}
        </Panel>

        <Panel title="LEADERBOARD" meta="SCORE = WEIGHTED RANK" className="leaderboard">
          <div className="ranking-config">
            {criteria.map((criterion) => (
              <label key={criterion.metric}>
                <input
                  type="checkbox"
                  checked={criterion.enabled}
                  onChange={(event) =>
                    setCriteria((previous) =>
                      previous.map((item) =>
                        item.metric === criterion.metric
                          ? { ...item, enabled: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />
                {METRIC_LABELS[criterion.metric as RankableMetric]}
              </label>
            ))}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>STRATEGY</th>
                  <th className="numeric">RETURN</th>
                  <th className="numeric">SHARPE</th>
                  <th className="numeric">MAX DD</th>
                  <th className="numeric">OOS</th>
                  <th className="numeric">TRADES</th>
                  <th className="numeric">SCORE</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((strategy, index) => (
                  <tr
                    key={strategy.id}
                    className={strategy.id === selected?.id ? "selected" : ""}
                    onClick={() => setSelectedId(strategy.id)}
                  >
                    <td className="rank">{index + 1}</td>
                    <td>{strategy.name}</td>
                    <td className={`numeric ${signClass(strategy.metrics.totalReturn)}`}>
                      {formatSignedPercent(strategy.metrics.totalReturn, 1)}
                    </td>
                    <td className="numeric">{formatNumber(strategy.metrics.sharpe)}</td>
                    <td className="numeric negative">-{formatPercent(strategy.metrics.maxDrawdown, 1)}</td>
                    <td className="numeric">
                      {strategy.outOfSample ? formatNumber(strategy.outOfSample.sharpe) : "—"}
                    </td>
                    <td className="numeric">{strategy.metrics.tradeCount}</td>
                    <td className="numeric score">{formatNumber(strategy.score, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="TRADE LOG"
          meta={selected ? `${selected.metrics.tradeCount} FILLED` : undefined}
          className="trades"
        >
          <div className="log">
            {selected?.trades.length ? (
              [...selected.trades].reverse().map((trade, index) => (
                <div className="log-line" key={`${trade.entryTime}-${index}`}>
                  <span className="muted">{formatTimestamp(trade.entryTime, intraday)}</span>
                  <b className={trade.side === "long" ? "positive" : "negative"}>
                    {trade.side.toUpperCase()}
                  </b>
                  <span className="muted">
                    {formatPrice(trade.entryPrice)} → {formatPrice(trade.exitPrice)}
                  </span>
                  <span className={`exit-${trade.exitReason}`}>{trade.exitReason}</span>
                  <span className={`numeric ${signClass(trade.pnl)}`}>
                    {formatSignedCurrency(trade.pnl, data?.currency)}
                  </span>
                </div>
              ))
            ) : (
              <p className="empty">No trades in this window</p>
            )}
            {selected && selected.truncatedTrades > 0 ? (
              <p className="empty">+{selected.truncatedTrades} earlier trades not shown</p>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="HERMES TERMINAL"
          meta={loading ? "● RUNNING" : "● READY"}
          className="terminal-panel"
        >
          <Terminal
            lines={lines}
            busy={loading}
            onSubmit={onCommand}
            onNote={(text) => print("note", text)}
          />
        </Panel>

        <Panel title="HISTORY" meta={history ? `${history.length}` : undefined} className="history-panel">
          <div className="log">
            {history === null ? <p className="empty">Loading…</p> : null}
            {history?.length === 0 ? (
              <p className="empty">No stored runs yet</p>
            ) : (
              history?.map((entry) => (
                <div className="log-line history-line" key={entry.runId}>
                  <span className="muted">{formatRelative(entry.createdAt)}</span>
                  <b>
                    {entry.symbol} {entry.timeframe}
                  </b>
                  <span className="muted">{entry.leaderId}</span>
                  <span className={`numeric ${signClass(entry.leaderReturn)}`}>
                    {formatSignedPercent(entry.leaderReturn, 1)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <footer>
        <span>
          Next-bar open execution · {config.commissionBps} bps commission · {config.slippageBps} bps
          slippage · {Math.round(config.positionSizePct * 100)}% of equity per position
        </span>
        <span className="muted">Historical data via Yahoo Finance · Educational use, not financial advice</span>
      </footer>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <b className={tone === undefined ? "" : signClass(tone)}>{value}</b>
    </div>
  );
}
