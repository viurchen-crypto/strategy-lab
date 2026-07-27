"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { RunHistoryResponse, RunHistoryRow } from "@/app/api/runs/route";
import { DEFAULT_REQUEST, TIMEFRAMES, type Timeframe } from "@/lib/contracts";
import type { BacktestResponse, StrategyRun } from "@/lib/engine";
import {
  formatCurrency,
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
import {
  HORIZON_LABELS,
  HORIZON_TIMEFRAME,
  HORIZONS,
  STRATEGY_CATALOG,
  type Horizon,
  type StrategyFamily,
} from "@/lib/strategies/catalog";
import {
  classifyInput,
  COMPARE_LIMIT,
  HELP_LINES,
  runCommand,
  type TerminalConfig,
} from "@/lib/terminal/commands";
import { buildContext as buildHermesContext } from "@/lib/hermes/prompt";
import { ChatPanel } from "./chat/chat-panel";
import { FloatingPanel } from "./chat/floating-panel";
import { useHermes } from "./chat/use-hermes";
import { Hint } from "./hint";
import { Palette, type PaletteAction } from "./palette";
import { Playback } from "./playback";
import { PriceChart } from "./price-chart";
import { Sparkline } from "./sparkline";
import { CommandLine, TerminalLog, type TerminalLine } from "./terminal";
import { DENSITY_ORDER, THEME_ORDER, useAppearance } from "./use-theme";
import { Verdict } from "./verdict";

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

/** Plain-language notes for the metrics, shown on hover, focus and tap. */
const METRIC_HELP: Record<string, string> = {
  "NET P&L": "Money made or lost over the window, after commission and slippage.",
  RETURN: "Total change in account equity across the tested window.",
  CAGR: "The same return expressed as a compound annual growth rate.",
  SHARPE: "Return per unit of volatility. Above 1 is good, above 2 is rare and suspicious.",
  SORTINO: "Like Sharpe, but only downside moves count against you.",
  "MAX DD": "The deepest peak-to-trough fall in equity. The loss you would have had to sit through.",
  CALMAR: "Annual return divided by the worst drawdown — reward per unit of pain.",
  "WIN RATE": "Share of trades that closed in profit. A high win rate can still lose money.",
  "PROFIT FACTOR": "Gross profit divided by gross loss. Below 1 means the rule loses money.",
  TRADES: "Number of completed round trips. Under ~30 the statistics are noise.",
  EXPOSURE: "Share of bars with a position open. Low exposure means most of the return is luck.",
};

const WORKSPACE_TABS = [
  { id: "leaderboard", label: "LEADERBOARD" },
  { id: "trades", label: "TRADE LOG" },
  { id: "tuning", label: "TUNING" },
  { id: "history", label: "HISTORY" },
  { id: "terminal", label: "TERMINAL" },
] as const;

type WorkspaceTab = (typeof WORKSPACE_TABS)[number]["id"];

const FAMILIES: readonly { id: StrategyFamily; label: string }[] = [
  { id: "trend", label: "Trend" },
  { id: "breakout", label: "Breakout" },
  { id: "momentum", label: "Momentum" },
  { id: "mean-reversion", label: "Reversion" },
];

/** Window shortcuts for the settings bar; `undefined` start means the full history. */
const WINDOWS: readonly { label: string; years?: number }[] = [
  { label: "1Y", years: 1 },
  { label: "3Y", years: 3 },
  { label: "5Y", years: 5 },
  { label: "MAX" },
];

const toDateInput = (seconds?: number): string =>
  seconds === undefined ? "" : new Date(seconds * 1_000).toISOString().slice(0, 10);

const fromDateInput = (value: string): number | undefined =>
  value ? Math.floor(Date.parse(`${value}T00:00:00Z`) / 1_000) : undefined;

/** Compares the form against the configuration the visible results were produced with. */
const signature = (config: TerminalConfig, overrides: Record<string, Record<string, number>>) =>
  JSON.stringify([config, overrides]);

interface NumberFieldProps {
  label: string;
  ariaLabel: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
  /** An empty optional field clears the setting instead of pinning it to zero. */
  optional?: boolean;
  className?: string;
  onCommit: (value: number | undefined) => void;
}

/**
 * A numeric input that survives being edited. `Number("")` is `0` and `Number("2e")`
 * is `NaN`, so binding a raw `onChange` straight to state pushed nonsense into the
 * request the moment you cleared the box. The draft string stays on screen while
 * you type and only values inside `[min, max]` are ever committed.
 */
function NumberField({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  placeholder,
  optional,
  className,
  onCommit,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <label className={`field ${className ?? ""}`}>
      <span>{label}</span>
      <input
        aria-label={ariaLabel}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={draft ?? (value === undefined ? "" : String(value))}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (raw.trim() === "") {
            if (optional) onCommit(undefined);
            return;
          }
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed >= min && parsed <= max) onCommit(parsed);
        }}
        // Leaving the field discards anything that never became a usable number.
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

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
    <section className={`panel ${className ?? ""}`} aria-label={title}>
      <header className="panel-title">
        <span className="title-text">{title}</span>
        {meta ? <span className="panel-meta">{meta}</span> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Dashboard() {
  const [config, setConfig] = useState<TerminalConfig>(INITIAL_CONFIG);
  const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({});
  const [applied, setApplied] = useState(() => signature(INITIAL_CONFIG, {}));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [data, setData] = useState<BacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Null until the viewer picks one, which makes the run's leader the default
   * selection. v1.1 opened on whichever rule happened to be first in the
   * catalog, so the page led with an arbitrary strategy rather than the answer.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<RankingCriterion[]>([...DEFAULT_RANKING]);
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [lines, setLines] = useState<TerminalLine[]>(WELCOME);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<WorkspaceTab>("leaderboard");
  const [history, setHistory] = useState<RunHistoryRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<StrategyFamily | null>(null);
  const [horizon, setHorizon] = useState<Horizon>("all");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  /** Bumped to pop the chat window open; the panel owns collapsed/expanded itself. */
  const [chatOpenRequest, setChatOpenRequest] = useState(0);
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [seenAnswers, setSeenAnswers] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const requestId = useRef(0);
  const lineId = useRef(WELCOME.length);
  const tabRef = useRef<WorkspaceTab>("leaderboard");
  const symbolRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const appearance = useAppearance();

  /** Switching tabs also clears the terminal's unread badge. */
  const openTab = useCallback((next: WorkspaceTab) => {
    tabRef.current = next;
    setTab(next);
    if (next === "terminal") setUnread(0);
  }, []);

  const print = useCallback((tone: TerminalLine["tone"], text: string | string[]) => {
    const texts = Array.isArray(text) ? text : [text];
    setLines((previous) => [
      ...previous,
      ...texts.map((entry) => ({ id: (lineId.current += 1), tone, text: entry })),
    ].slice(-300));
    // Output printed while another tab is open is worth pointing at.
    if (tabRef.current !== "terminal") setUnread((count) => count + texts.length);
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
      // The form is no longer ahead of the results the moment the request leaves.
      setApplied(signature(next, parameters));
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
  /**
   * Re-measuring twenty strategies over a growing slice is far too heavy to do on
   * every animation frame. The chart and the playhead follow `cursor` exactly; the
   * panels follow this deferred copy and catch up between frames.
   */
  const metricsCursor = useDeferredValue(cursor);
  const atEnd = metricsCursor >= barCount - 1;

  /**
   * Metrics as of the playback cursor. At the end of the window this is exactly
   * what the server returned; mid-playback it is recomputed from the visible
   * slice so every panel agrees with the chart.
   */
  const visible = useMemo(() => {
    if (!data) return [];
    if (atEnd) return data.strategies;
    const cutoff = data.bars[metricsCursor]?.[0] ?? Number.POSITIVE_INFINITY;
    return data.strategies.map((strategy) => {
      const equity = strategy.equity.slice(0, metricsCursor + 1);
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
  }, [data, metricsCursor, atEnd]);

  // Ranking is relative to the current run, so re-scoring on toggle needs no refetch.
  const ranked = useMemo(() => {
    if (visible.length === 0) return [];
    const scores = scoreCandidates(visible, criteria);
    return visible
      .map((strategy, index) => ({ ...strategy, score: Math.round(scores[index] * 10) / 10 }))
      .sort((a, b) => b.score - a.score);
  }, [visible, criteria]);

  /** The catalog is filtered; the leaderboard and the ranking are not. */
  const shortlist = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return ranked.filter(
      (strategy) =>
        (family === null || strategy.family === family) &&
        (horizon === "all" || strategy.horizon === horizon) &&
        (needle === "" ||
          strategy.name.toLowerCase().includes(needle) ||
          strategy.id.toLowerCase().includes(needle) ||
          strategy.family.includes(needle)),
    );
  }, [ranked, search, family, horizon]);

  const selected: (StrategyRun & { score?: number }) | undefined = useMemo(
    () => ranked.find((strategy) => strategy.id === selectedId) ?? ranked[0],
    [ranked, selectedId],
  );

  /** The compared runs, in the order they were picked, minus the focused one. */
  const compared = useMemo(
    () =>
      compareIds
        .filter((id) => id !== selected?.id)
        .map((id) => visible.find((strategy) => strategy.id === id))
        .filter((strategy): strategy is (typeof visible)[number] => strategy !== undefined),
    [compareIds, visible, selected],
  );

  const selectedMeta = STRATEGY_CATALOG.find((strategy) => strategy.id === selected?.id);
  const intraday = data ? isIntraday(data.timeframe) : false;
  const lastClose = data?.bars[Math.min(cursor, barCount - 1)]?.[4];
  const dirty = signature(config, overrides) !== applied;

  const update = <K extends keyof TerminalConfig>(key: K, value: TerminalConfig[K]) =>
    setConfig((previous) => ({ ...previous, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(config, overrides);
  };

  /** Every quick change — preset, timeframe, window — reruns immediately. */
  const applyAndRun = useCallback(
    (patch: Partial<TerminalConfig>) => {
      const next = { ...config, ...patch };
      setConfig(next);
      void run(next, overrides);
    },
    [config, run, overrides],
  );

  /** Re-runs whatever the form currently says, from a place that is not a form. */
  const rerun = useCallback(() => {
    void run(config, overrides);
  }, [run, config, overrides]);

  /** Compare is capped: past five curves the chart is a smear, not a comparison. */
  const toggleCompare = useCallback((strategyId: string) => {
    setCompareIds((previous) =>
      previous.includes(strategyId)
        ? previous.filter((id) => id !== strategyId)
        : previous.length >= COMPARE_LIMIT
          ? previous
          : [...previous, strategyId],
    );
  }, []);

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
      // Typing a command is a request to watch its output.
      openTab("terminal");
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

        case "compare":
          setCompareIds(result.strategyIds);
          break;

        case "horizon":
          setHorizon(result.horizon);
          // A horizon is a bar size as much as a shortlist, so it moves the run.
          if (result.horizon !== "all") {
            applyAndRun({ timeframe: HORIZON_TIMEFRAME[result.horizon] as Timeframe });
          }
          break;

        case "open":
          openTab(result.tab);
          break;

        case "navigate":
          if (result.target !== "lab") window.location.href = `/${result.target}`;
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
    [
      config,
      overrides,
      run,
      print,
      openTab,
      data,
      ranked,
      selected,
      intraday,
      exportCsv,
      loadHistory,
      applyAndRun,
    ],
  );

  /**
   * What Hermes is told about the screen, rebuilt per turn so a question asked
   * later is answered against the run that is showing now.
   */
  const chatContext = useCallback(() => {
    if (!data) return "CURRENT RUN\nNothing has been run yet.";
    const meta = selected ? STRATEGY_CATALOG.find(({ id }) => id === selected.id) : undefined;

    return buildHermesContext({
      symbol: data.symbol,
      exchange: data.exchange,
      timeframe: data.timeframe,
      barCount: data.barCount,
      periodStart: formatTimestamp(data.periodStart),
      periodEnd: formatTimestamp(data.periodEnd),
      currency: data.currency,
      benchmarkReturn: data.benchmark.metrics.totalReturn,
      benchmarkSharpe: data.benchmark.metrics.sharpe,
      page: "the lab — chart, leaderboard and performance panels",
      leaders: ranked.slice(0, 6).map((strategy, index) => ({
        rank: index + 1,
        id: strategy.id,
        name: strategy.name,
        family: strategy.family,
        totalReturn: strategy.metrics.totalReturn,
        sharpe: strategy.metrics.sharpe,
        maxDrawdown: strategy.metrics.maxDrawdown,
        tradeCount: strategy.metrics.tradeCount,
      })),
      selected: selected
        ? {
            id: selected.id,
            name: selected.name,
            family: selected.family,
            description: selected.description,
            evidence: meta ? `${meta.evidence.title} — ${meta.evidence.note}` : "not recorded",
            parameters: selected.parameters,
            totalReturn: selected.metrics.totalReturn,
            cagr: selected.metrics.cagr,
            sharpe: selected.metrics.sharpe,
            sortino: selected.metrics.sortino,
            maxDrawdown: selected.metrics.maxDrawdown,
            calmar: selected.metrics.calmar,
            winRate: selected.metrics.winRate,
            profitFactor: selected.metrics.profitFactor,
            tradeCount: selected.metrics.tradeCount,
            exposure: selected.metrics.exposure,
            inSampleSharpe: selected.inSample?.sharpe,
            outOfSampleSharpe: selected.outOfSample?.sharpe,
            warnings: selected.warnings ?? [],
          }
        : undefined,
    });
  }, [data, ranked, selected]);

  const hermes = useHermes(chatContext);

  /**
   * One box, two jobs. `classifyInput` decides which — a slash or a known verb
   * is a command, a sentence is a question for Hermes — so the terminal keeps
   * working exactly as it did and plain English stops being an error.
   */
  const onSubmitLine = useCallback(
    (raw: string) => {
      const { kind, text } = classifyInput(raw);
      if (kind === "command") {
        onCommand(text);
        return;
      }
      setChatOpenRequest((count) => count + 1);
      void hermes.send(text);
    },
    [onCommand, hermes],
  );

  /**
   * Everything the palette can do. Each entry dispatches into the same handler
   * the terminal and the chrome already use, so there is one behaviour per
   * action rather than one per entry point.
   */
  const actions = useMemo<PaletteAction[]>(
    () => [
      ...INSTRUMENTS.map((instrument) => ({
        id: `symbol-${instrument.symbol}`,
        group: "Markets",
        glyph: "◆",
        label: instrument.label,
        note: instrument.symbol,
        keywords: `${instrument.group} symbol market`,
        run: () => applyAndRun({ symbol: instrument.symbol }),
      })),
      ...TIMEFRAMES.map((timeframe) => ({
        id: `timeframe-${timeframe}`,
        group: "Timeframe",
        glyph: "⏱",
        label: `Switch to ${timeframe} bars`,
        note: timeframe,
        run: () => applyAndRun({ timeframe: timeframe as Timeframe }),
      })),
      ...STRATEGY_CATALOG.map((strategy) => ({
        id: `strategy-${strategy.id}`,
        group: "Strategies",
        glyph: "▤",
        label: strategy.name,
        note: strategy.code,
        keywords: `${strategy.family} ${strategy.id}`,
        run: () => {
          setSelectedId(strategy.id);
          setFamily(null);
          setSearch("");
        },
      })),
      ...criteria.map((criterion) => ({
        id: `rank-${criterion.metric}`,
        group: "Ranking",
        glyph: criterion.enabled ? "☑" : "☐",
        label: `${criterion.enabled ? "Stop ranking" : "Rank"} by ${METRIC_LABELS[criterion.metric]}`,
        keywords: "sort score leaderboard",
        run: () =>
          setCriteria((previous) =>
            previous.map((item) =>
              item.metric === criterion.metric ? { ...item, enabled: !item.enabled } : item,
            ),
          ),
      })),
      ...THEME_ORDER.map((theme) => ({
        id: `theme-${theme}`,
        group: "Appearance",
        glyph: "◐",
        label: `Theme: ${theme}`,
        keywords: "dark light colour color appearance",
        run: () => appearance.setTheme(theme),
      })),
      ...DENSITY_ORDER.map((density) => ({
        id: `density-${density}`,
        group: "Appearance",
        glyph: "▤",
        label: `Density: ${density}`,
        keywords: "spacing size comfortable compact",
        run: () => appearance.setDensity(density),
      })),
      ...WORKSPACE_TABS.map((entry) => ({
        id: `tab-${entry.id}`,
        group: "Go to",
        glyph: "→",
        label: `Open ${entry.label.toLowerCase()}`,
        keywords: "panel view tab",
        run: () => openTab(entry.id),
      })),
      {
        id: "action-run",
        group: "Actions",
        glyph: "▶",
        label: "Run the backtest again",
        note: "↵",
        run: () => rerun(),
      },
      {
        id: "action-benchmark",
        group: "Actions",
        glyph: "⌁",
        label: `${showBenchmark ? "Hide" : "Show"} the buy & hold curve`,
        keywords: "benchmark compare",
        run: () => setShowBenchmark((value) => !value),
      },
      {
        id: "action-settings",
        group: "Actions",
        glyph: "⚙",
        label: `${settingsOpen ? "Hide" : "Show"} execution settings`,
        keywords: "costs commission slippage stop size dates",
        run: () => setSettingsOpen((value) => !value),
      },
      {
        id: "action-export",
        group: "Actions",
        glyph: "⇩",
        label: "Export the trade log as CSV",
        keywords: "download save trades",
        run: () => exportCsv(),
      },
      {
        id: "action-help",
        group: "Actions",
        glyph: "?",
        label: "Show the terminal command reference",
        note: "?",
        run: () => {
          openTab("terminal");
          print("output", HELP_LINES);
        },
      },
    ],
    [
      applyAndRun,
      criteria,
      appearance,
      openTab,
      rerun,
      showBenchmark,
      settingsOpen,
      exportCsv,
      print,
    ],
  );

  // Whole-page shortcuts, deliberately single-key and inert while typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The palette is the one shortcut that has to work from inside a field.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable === true);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      const step = (delta: number) => {
        event.preventDefault();
        setCursor((previous) => Math.max(0, Math.min(barCount - 1, previous + delta)));
      };

      switch (event.key) {
        case "`":
        case "'":
          event.preventDefault();
          openTab("terminal");
          commandRef.current?.focus();
          break;
        case "/":
          event.preventDefault();
          symbolRef.current?.focus();
          symbolRef.current?.select();
          break;
        case "?":
          event.preventDefault();
          openTab("terminal");
          print("output", HELP_LINES);
          break;
        case "ArrowLeft":
          step(-1);
          break;
        case "ArrowRight":
          step(1);
          break;
        case "Home":
          event.preventDefault();
          setCursor(0);
          break;
        case "End":
          event.preventDefault();
          setCursor(Math.max(0, barCount - 1));
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [barCount, print, openTab]);

  // Unread is derived, never stored: no effect has to keep a counter in sync.
  const answeredCount = hermes.turns.filter(
    (turn) => turn.role === "assistant" && turn.text.length > 0,
  ).length;
  const unreadAnswers = chatCollapsed ? Math.max(0, answeredCount - seenAnswers) : 0;

  const notes = data?.notes ?? [];
  const warnings = selected?.warnings ?? [];
  const firstLoad = loading && data === null;

  const tabCount: Record<WorkspaceTab, number | undefined> = {
    leaderboard: ranked.length || undefined,
    trades: selected?.trades.length,
    tuning: undefined,
    history: history?.length,
    terminal: unread || undefined,
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ❯
          </span>
          <h1>STRATEGY LAB</h1>
          <span className="version">v1.2</span>
        </div>

        <form className="runbar" onSubmit={submit}>
          <div className="symbol-group">
            <input
              ref={symbolRef}
              aria-label="Symbol"
              list="instruments"
              value={config.symbol}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => update("symbol", event.target.value.toUpperCase())}
            />
            <datalist id="instruments">
              {INSTRUMENTS.map((instrument) => (
                <option key={instrument.symbol} value={instrument.symbol}>
                  {instrument.label}
                </option>
              ))}
            </datalist>
            <select
              aria-label="Preset instruments"
              value=""
              onChange={(event) => applyAndRun({ symbol: event.target.value })}
            >
              <option value="" disabled>
                ▾
              </option>
              {[...new Set(INSTRUMENTS.map(({ group }) => group))].map((group) => (
                <optgroup key={group} label={group}>
                  {INSTRUMENTS.filter((instrument) => instrument.group === group).map((instrument) => (
                    <option key={instrument.symbol} value={instrument.symbol}>
                      {instrument.symbol} — {instrument.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="segmented" role="group" aria-label="Timeframe">
            {TIMEFRAMES.map((timeframe) => (
              <button
                type="button"
                key={timeframe}
                className={timeframe === config.timeframe ? "active" : ""}
                aria-pressed={timeframe === config.timeframe}
                onClick={() => applyAndRun({ timeframe: timeframe as Timeframe })}
              >
                {timeframe}
              </button>
            ))}
          </div>

          <button
            type="submit"
            className={dirty ? "run dirty" : "run"}
            disabled={loading}
            title="Run the whole catalog on this market (⏎)"
          >
            {loading ? "RUNNING…" : dirty ? "APPLY CHANGES" : "RUN BACKTEST"}
          </button>
        </form>

        <div className="topbar-tools">
          <button
            type="button"
            className="palette-trigger"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open the command palette"
          >
            <span className="glyph" aria-hidden="true">
              ⌕
            </span>
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={appearance.cycleTheme}
            aria-label={`Appearance: ${appearance.theme}. Switch theme`}
            title={`Theme: ${appearance.theme}`}
          >
            <span aria-hidden="true">{appearance.themeGlyph}</span>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={appearance.cycleDensity}
            aria-label={`Density: ${appearance.density}. Switch density`}
            title={`Density: ${appearance.density}`}
          >
            <span aria-hidden="true">{appearance.densityGlyph}</span>
          </button>
        </div>

        <div className="status">
          {data ? (
            <>
              <span className="status-chip">
                <b>{data.symbol}</b> {data.exchange}
              </span>
              <span className="status-chip">
                {data.barCount} bars · {formatTimestamp(data.periodStart)} →{" "}
                {formatTimestamp(data.periodEnd)}
              </span>
              <span className="status-chip">
                <span className={loading ? "dot busy" : "dot live"} aria-hidden="true" />
                {loading ? "RUNNING" : `${data.source.toUpperCase()} ${formatRelative(data.fetchedAt)}`}
              </span>
            </>
          ) : (
            <span className="status-chip">
              <span className="dot busy" aria-hidden="true" />
              CONNECTING
            </span>
          )}
        </div>
      </header>

      <div className={loading ? "progress running" : "progress"} role="presentation" />

      <Verdict
        data={data}
        strategy={selected}
        isLeader={selected?.id === ranked[0]?.id}
        loading={loading}
      />

      <div className={settingsOpen ? "settings open" : "settings"}>
        <div className="settings-bar">
          <button
            type="button"
            className="settings-toggle"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <span className="caret" aria-hidden="true">
              ▶
            </span>
            EXECUTION
          </button>

          {settingsOpen ? null : (
            <p className="settings-summary">
              <span>{formatCurrency(config.capital)}</span>
              <span>
                {config.commissionBps}/{config.slippageBps} bps
              </span>
              <span>{Math.round(config.positionSizePct * 100)}% size</span>
              <span>
                {config.stopLossPct === undefined
                  ? "no stop"
                  : `${Math.round(config.stopLossPct * 1_000) / 10}% stop`}
              </span>
              <span>{config.direction === "both" ? "long+short" : `${config.direction} only`}</span>
              <span>
                {config.splitFraction > 0
                  ? `${Math.round(config.splitFraction * 100)}% in-sample`
                  : "no split"}
              </span>
            </p>
          )}

          <div className="presets" role="group" aria-label="Date window">
            {WINDOWS.map(({ label, years }) => (
              <button
                type="button"
                key={label}
                className="preset-chip"
                onClick={() =>
                  applyAndRun({
                    start:
                      years === undefined
                        ? undefined
                        : Math.floor(Date.now() / 1_000) - years * 365 * 24 * 3_600,
                    end: undefined,
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {settingsOpen ? (
          <div className="settings-fields">
            <NumberField
              label="CAPITAL"
              ariaLabel="Initial capital"
              value={config.capital}
              min={1}
              max={1_000_000_000}
              step={100}
              onCommit={(value) => value !== undefined && update("capital", value)}
            />
            <NumberField
              label="FEE bps"
              ariaLabel="Commission in basis points"
              value={config.commissionBps}
              min={0}
              max={1000}
              step={1}
              onCommit={(value) => value !== undefined && update("commissionBps", value)}
            />
            <NumberField
              label="SLIP bps"
              ariaLabel="Slippage in basis points"
              value={config.slippageBps}
              min={0}
              max={1000}
              step={1}
              onCommit={(value) => value !== undefined && update("slippageBps", value)}
            />
            <NumberField
              label="SIZE %"
              ariaLabel="Position size percent"
              value={Math.round(config.positionSizePct * 100)}
              min={1}
              max={100}
              step={1}
              onCommit={(value) => value !== undefined && update("positionSizePct", value / 100)}
            />
            <NumberField
              label="STOP %"
              ariaLabel="Stop loss percent"
              value={config.stopLossPct === undefined ? undefined : Math.round(config.stopLossPct * 1_000) / 10}
              min={0}
              max={90}
              step={0.5}
              placeholder="off"
              optional
              onCommit={(value) => update("stopLossPct", value && value > 0 ? value / 100 : undefined)}
            />
            <NumberField
              label="TARGET %"
              ariaLabel="Take profit percent"
              value={
                config.takeProfitPct === undefined ? undefined : Math.round(config.takeProfitPct * 1_000) / 10
              }
              min={0}
              max={500}
              step={0.5}
              placeholder="off"
              optional
              onCommit={(value) => update("takeProfitPct", value && value > 0 ? value / 100 : undefined)}
            />
            <label className="field">
              <span>SIDE</span>
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
            <NumberField
              label="IN-SAMPLE %"
              ariaLabel="In-sample share percent"
              value={Math.round(config.splitFraction * 100)}
              min={0}
              max={95}
              step={5}
              onCommit={(value) => value !== undefined && update("splitFraction", value / 100)}
            />
            <label className="field">
              <span>FROM</span>
              <input
                aria-label="Window start date"
                type="date"
                value={toDateInput(config.start)}
                onChange={(event) => update("start", fromDateInput(event.target.value))}
              />
            </label>
            <label className="field">
              <span>TO</span>
              <input
                aria-label="Window end date"
                type="date"
                value={toDateInput(config.end)}
                onChange={(event) => update("end", fromDateInput(event.target.value))}
              />
            </label>
            <p className="settings-note">
              Costs are charged on both sides of every fill. Stops and targets are checked against the
              bar&apos;s high and low before the next signal is acted on.
            </p>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="alert" role="alert">
          <span aria-hidden="true">!</span> {error}
          {data ? " · Showing the last successful run." : ""}
        </p>
      ) : null}
      {notes.map((note) => (
        <p className="note-strip" key={note}>
          <span aria-hidden="true">⚠</span> {note}
        </p>
      ))}

      <div className="dashboard-grid">
        <Panel
          title="STRATEGIES"
          meta={`${shortlist.length}/${ranked.length || STRATEGY_CATALOG.length}`}
          className="catalog"
        >
          <div className="catalog-filter">
            <div className="catalog-search">
              <span className="search-glyph" aria-hidden="true">
                ⌕
              </span>
              <input
                aria-label="Filter strategies"
                placeholder="Filter strategies"
                spellCheck={false}
                autoComplete="off"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="family-chips" role="group" aria-label="Holding horizon">
              {HORIZONS.map((entry) => (
                <button
                  type="button"
                  key={entry}
                  className={horizon === entry ? "chip on" : "chip"}
                  aria-pressed={horizon === entry}
                  title={
                    entry === "all"
                      ? "Every horizon"
                      : `Rules published for ${HORIZON_LABELS[entry].toLowerCase()} holding, on ${
                          HORIZON_TIMEFRAME[entry]
                        } bars`
                  }
                  onClick={() => {
                    setHorizon(entry);
                    // The horizon is a bar size as much as a shortlist.
                    if (entry !== "all") {
                      applyAndRun({ timeframe: HORIZON_TIMEFRAME[entry] as Timeframe });
                    }
                  }}
                >
                  {HORIZON_LABELS[entry]}
                </button>
              ))}
            </div>
            <div className="family-chips" role="group" aria-label="Strategy family">
              {FAMILIES.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={family === entry.id ? "chip on" : "chip"}
                  aria-pressed={family === entry.id}
                  onClick={() => setFamily((current) => (current === entry.id ? null : entry.id))}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          <div className="strategy-list">
            {firstLoad ? (
              <div className="skeleton-list" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                  <div className="skeleton skeleton-row" key={index} />
                ))}
              </div>
            ) : null}
            {shortlist.map((strategy, index) => (
              <div className="strategy-row" key={strategy.id}>
              <button
                type="button"
                className={strategy.id === selected?.id ? "strategy selected" : "strategy"}
                aria-pressed={strategy.id === selected?.id}
                onClick={() => setSelectedId(strategy.id)}
              >
                <span className="rank">{index + 1}</span>
                <span className="strategy-label">
                  <span className="strategy-name">{strategy.name}</span>
                  <span className="strategy-family">{strategy.family.replace("-", " ")}</span>
                </span>
                <Sparkline values={strategy.equity} tone={strategy.metrics.totalReturn} />
                <span className={`numeric ${signClass(strategy.metrics.totalReturn)}`}>
                  {formatSignedPercent(strategy.metrics.totalReturn, 1)}
                </span>
              </button>
              <button
                type="button"
                className={compareIds.includes(strategy.id) ? "compare-toggle on" : "compare-toggle"}
                aria-pressed={compareIds.includes(strategy.id)}
                aria-label={`Compare ${strategy.name}`}
                title={`Overlay ${strategy.name} on the chart`}
                style={
                  compareIds.includes(strategy.id)
                    ? { color: `var(--series-${compareIds.indexOf(strategy.id) + 1})` }
                    : undefined
                }
                onClick={() => toggleCompare(strategy.id)}
              >
                <span aria-hidden="true">{compareIds.includes(strategy.id) ? "◉" : "○"}</span>
              </button>
              </div>
            ))}
            {!firstLoad && shortlist.length === 0 ? (
              <p className="empty">
                <span className="empty-glyph" aria-hidden="true">
                  ⌕
                </span>
                {ranked.length === 0
                  ? "No results yet — run a backtest."
                  : "No strategy matches that filter."}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="MARKET"
          meta={
            data && lastClose !== undefined ? (
              <>
                <span className="price-readout">
                  <b>{formatPrice(lastClose)}</b>
                  <span className="faint">{data.currency}</span>
                </span>
                {compared.length > 0 ? (
                  <span className="series-legend">
                    {compared.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        title={`Stop comparing ${entry.name}`}
                        onClick={() => toggleCompare(entry.id)}
                      >
                        <span
                          className="swatch"
                          style={{
                            background: `var(--series-${compareIds.indexOf(entry.id) + 1})`,
                          }}
                          aria-hidden="true"
                        />
                        {entry.code}
                      </button>
                    ))}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={showBenchmark ? "toggle on" : "toggle"}
                  aria-label="Buy and hold benchmark"
                  aria-pressed={showBenchmark}
                  title="Overlay a buy-and-hold equity curve"
                  onClick={() => setShowBenchmark((value) => !value)}
                >
                  BUY&amp;HOLD
                </button>
              </>
            ) : null
          }
          className="market"
        >
          {data && selected ? (
            <>
              <div className="chart-area">
                <PriceChart
                  bars={data.bars}
                  strategy={data.strategies.find(({ id }) => id === selected.id) ?? selected}
                  compared={compared}
                  benchmarkEquity={data.benchmark.equity}
                  timeframe={data.timeframe}
                  showBenchmark={showBenchmark}
                  cursor={cursor}
                  splitIndex={data.splitIndex}
                />
              </div>
              <Playback
                barCount={barCount}
                cursor={cursor}
                onCursor={setCursor}
                label={formatTimestamp(data.bars[Math.min(cursor, barCount - 1)][0], intraday)}
                equity={data.strategies.find(({ id }) => id === selected.id)?.equity ?? selected.equity}
                splitIndex={data.splitIndex}
              />
            </>
          ) : (
            <p className="empty">
              <span className="empty-glyph" aria-hidden="true">
                ▤
              </span>
              {error ? "No data for this market" : "Loading market data…"}
            </p>
          )}
        </Panel>

        <Panel title="PERFORMANCE" meta={selected?.name} className="performance">
          {selected && data ? (
            <>
              <div className="hero-metric">
                <span className="hero-value">
                  <b className={signClass(selected.metrics.totalReturn)}>
                    {formatSignedPercent(selected.metrics.totalReturn, 1)}
                  </b>
                  <span>total return · net of costs</span>
                </span>
                <span className="hero-vs">
                  buy &amp; hold
                  <b className={signClass(data.benchmark.metrics.totalReturn)}>
                    {formatSignedPercent(data.benchmark.metrics.totalReturn, 1)}
                  </b>
                </span>
              </div>

              <div className="metrics">
                <Metric label="NET P&L" value={formatSignedCurrency(selected.metrics.netPnl, data.currency)} tone={selected.metrics.netPnl} />
                <Metric label="CAGR" value={formatSignedPercent(selected.metrics.cagr)} tone={selected.metrics.cagr} />
                <Metric label="SHARPE" value={formatNumber(selected.metrics.sharpe)} tone={selected.metrics.sharpe} />
                <Metric label="SORTINO" value={formatNumber(selected.metrics.sortino)} tone={selected.metrics.sortino} />
                <Metric label="MAX DD" value={`-${formatPercent(selected.metrics.maxDrawdown)}`} tone={-1} />
                <Metric label="CALMAR" value={formatNumber(selected.metrics.calmar)} tone={selected.metrics.calmar} />
                <Metric label="WIN RATE" value={formatPercent(selected.metrics.winRate, 1)} />
                <Metric label="PROFIT FACTOR" value={formatNumber(selected.metrics.profitFactor)} tone={selected.metrics.profitFactor - 1} />
                <Metric label="TRADES" value={String(selected.metrics.tradeCount)} />
                <Metric label="EXPOSURE" value={formatPercent(selected.metrics.exposure, 1)} />
              </div>

              {selected.inSample && selected.outOfSample ? (
                <div className="split-metrics">
                  <div className="split-head">
                    <span>SPLIT</span>
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
                  <p className="split-note">
                    The out-of-sample half is the part the parameters never saw. Trust it more.
                  </p>
                </div>
              ) : null}

              {warnings.map((warning) => (
                <p className="warning" key={warning}>
                  <span aria-hidden="true">⚠</span> {warning}
                </p>
              ))}

              <p className="benchmark-note">
                Buy &amp; hold over the same window:{" "}
                <b className={signClass(data.benchmark.metrics.totalReturn)}>
                  {formatSignedPercent(data.benchmark.metrics.totalReturn)}
                </b>{" "}
                · Sharpe {formatNumber(data.benchmark.metrics.sharpe)}
              </p>
            </>
          ) : (
            <p className="empty">
              <span className="empty-glyph" aria-hidden="true">
                ∿
              </span>
              {loading ? "Measuring…" : "No strategy selected"}
            </p>
          )}
        </Panel>

        <section className="panel workspace">
          <header className="tabbar" role="tablist" aria-label="Detail views">
            {WORKSPACE_TABS.map((entry) => (
              <button
                type="button"
                key={entry.id}
                role="tab"
                id={`tab-${entry.id}`}
                aria-selected={tab === entry.id}
                aria-controls={`panel-${entry.id}`}
                className={tab === entry.id ? "tab active" : "tab"}
                onClick={() => openTab(entry.id)}
              >
                {entry.label}
                {tabCount[entry.id] !== undefined ? (
                  <span className={entry.id === "terminal" && unread ? "badge alert-badge" : "badge"}>
                    {tabCount[entry.id]}
                  </span>
                ) : null}
              </button>
            ))}
            {selected ? (
              <span className="tabbar-context">
                {selected.code} {selected.name}
              </span>
            ) : null}
          </header>

          <div
            className="panel-body"
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "leaderboard" ? (
              <>
                <div className="ranking-config">
                  <span className="eyebrow">RANK BY</span>
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
                        <th className="numeric">OOS SHARPE</th>
                        <th className="numeric">TRADES</th>
                        <th className="numeric">SCORE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((strategy, index) => (
                        <tr key={strategy.id} className={strategy.id === selected?.id ? "selected" : ""}>
                          <td className="rank">{index + 1}</td>
                          <td>
                            <button
                              type="button"
                              className="table-strategy"
                              aria-pressed={strategy.id === selected?.id}
                              onClick={() => setSelectedId(strategy.id)}
                            >
                              {strategy.name}
                            </button>
                          </td>
                          <td className={`numeric ${signClass(strategy.metrics.totalReturn)}`}>
                            {formatSignedPercent(strategy.metrics.totalReturn, 1)}
                          </td>
                          <td className="numeric">{formatNumber(strategy.metrics.sharpe)}</td>
                          <td className="numeric negative">
                            -{formatPercent(strategy.metrics.maxDrawdown, 1)}
                          </td>
                          <td className="numeric">
                            {strategy.outOfSample ? formatNumber(strategy.outOfSample.sharpe) : "—"}
                          </td>
                          <td className="numeric">{strategy.metrics.tradeCount}</td>
                          <td className="numeric score-cell">
                            <span className="score">{formatNumber(strategy.score, 1)}</span>
                            {/* The bar turns twenty scores into one shape you can scan. */}
                            <span
                              className="score-bar"
                              style={{ width: `${Math.max(2, strategy.score * 0.44)}px` }}
                              aria-hidden="true"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ranked.length === 0 ? (
                    <p className="empty">{loading ? "Running the catalog…" : "No results yet"}</p>
                  ) : null}
                </div>
              </>
            ) : null}

            {tab === "trades" ? (
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
                  <p className="empty">
                    <span className="empty-glyph" aria-hidden="true">
                      ∅
                    </span>
                    No trades up to this point of the replay — scrub forward or pick another strategy.
                  </p>
                )}
                {selected && selected.truncatedTrades > 0 ? (
                  <p className="empty">+{selected.truncatedTrades} earlier trades not shown</p>
                ) : null}
              </div>
            ) : null}

            {tab === "tuning" ? (
              selectedMeta && selected ? (
                <div className="tuning">
                  <div className="tuning-about">
                    <h2>
                      <span className="code">{selectedMeta.code}</span>
                      {selectedMeta.name}
                    </h2>
                    <p className="description">{selectedMeta.description}</p>
                    <a
                      className="evidence-card"
                      href={selectedMeta.evidence.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="evidence">↗ {selectedMeta.evidence.title}</span>
                      <p>{selectedMeta.evidence.note}</p>
                    </a>
                  </div>
                  <div className="tuning-params">
                    <div className="param-list">
                      {selectedMeta.parameters.map((parameter) => {
                        const changed = overrides[selectedMeta.id]?.[parameter.key] !== undefined;
                        return (
                          <div className={changed ? "param-row changed" : "param-row"} key={parameter.key}>
                            <NumberField
                              label={parameter.label}
                              ariaLabel={`${selectedMeta.name} ${parameter.label}`}
                              value={
                                overrides[selectedMeta.id]?.[parameter.key] ??
                                selected.parameters[parameter.key] ??
                                parameter.value
                              }
                              min={parameter.min}
                              max={parameter.max}
                              step={parameter.step}
                              onCommit={(value) =>
                                value !== undefined && setParameter(selectedMeta.id, parameter.key, value)
                              }
                            />
                            <span className="range-hint">
                              {parameter.min}–{parameter.max}
                            </span>
                          </div>
                        );
                      })}
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
                        disabled={overrides[selectedMeta.id] === undefined}
                      >
                        RESET
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        aria-label="Export selected strategy trades as CSV"
                        onClick={exportCsv}
                        disabled={selected.trades.length === 0}
                      >
                        EXPORT CSV
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="empty">Pick a strategy to tune it</p>
              )
            ) : null}

            {tab === "history" ? (
              <div className="log">
                {history === null ? <p className="empty">Loading…</p> : null}
                {history?.length === 0 ? (
                  <p className="empty">
                    <span className="empty-glyph" aria-hidden="true">
                      ⧗
                    </span>
                    No stored runs yet — every backtest you run lands here.
                  </p>
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
            ) : null}

            {tab === "terminal" ? <TerminalLog lines={lines} /> : null}
          </div>
        </section>
      </div>

      <CommandLine
        onSubmit={onSubmitLine}
        onNote={(text) => print("note", text)}
        busy={loading}
        inputRef={commandRef}
      />

      <FloatingPanel
        title="Hermes"
        unread={unreadAnswers}
        openRequest={chatOpenRequest}
        onCollapsedChange={(collapsed) => {
          setChatCollapsed(collapsed);
          if (!collapsed) setSeenAnswers(answeredCount);
        }}
        headerExtra={
          <span className={`chat-state ${hermes.state}`} title={`Bridge: ${hermes.state}`}>
            <span className="dot" aria-hidden="true" />
            <span className="visually-hidden">Hermes is {hermes.state}</span>
          </span>
        }
      >
        <ChatPanel
          turns={hermes.turns}
          streaming={hermes.streaming}
          state={hermes.state}
          onSend={hermes.send}
          onStop={hermes.stop}
          onCommand={onCommand}
        />
      </FloatingPanel>

      <footer>
        <span>
          Next-bar open execution · {config.commissionBps} bps commission · {config.slippageBps} bps
          slippage · {Math.round(config.positionSizePct * 100)}% of equity per position
        </span>
        <span className="shortcuts">
          <kbd>⌘K</kbd> search <kbd>/</kbd> symbol <kbd>`</kbd> command <kbd>←</kbd>
          <kbd>→</kbd> step <kbd>?</kbd> help
        </span>
        <span className="muted">Historical data via Yahoo Finance · Educational use, not financial advice</span>
      </footer>

      {/* Mounted only while open, so every open starts on an empty search. */}
      {paletteOpen ? <Palette onClose={() => setPaletteOpen(false)} actions={actions} /> : null}
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const help = METRIC_HELP[label];
  return (
    <div className="metric">
      {help ? <Hint label={label}>{help}</Hint> : <span>{label}</span>}
      <b className={tone === undefined ? "" : signClass(tone)}>{value}</b>
    </div>
  );
}
