"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScreenerResponse } from "@/app/api/screener/route";
import { formatNumber, formatPercent, formatPrice, formatSignedPercent, signClass } from "@/lib/format";
import type { ScreenerRow } from "@/lib/screener/measure";
import { SP500_SECTORS } from "@/lib/universe";
import { Nav } from "../nav";

const SECTORS = [...SP500_SECTORS, "Crypto"];

interface Column {
  readonly key: keyof ScreenerRow;
  readonly label: string;
  readonly hint: string;
  readonly render: (row: ScreenerRow) => React.ReactNode;
  readonly numeric?: boolean;
}

const percent = (value: number | null, digits = 1) =>
  value === null ? <span className="faint">—</span> : (
    <span className={signClass(value)}>{formatSignedPercent(value, digits)}</span>
  );

const COLUMNS: Column[] = [
  {
    key: "price",
    label: "PRICE",
    hint: "Last daily close",
    numeric: true,
    render: (row) => formatPrice(row.price),
  },
  { key: "change1d", label: "1D", hint: "One-session change", numeric: true, render: (row) => percent(row.change1d) },
  { key: "change1w", label: "1W", hint: "Five-session change", numeric: true, render: (row) => percent(row.change1w) },
  { key: "change1m", label: "1M", hint: "Twenty-one-session change", numeric: true, render: (row) => percent(row.change1m) },
  { key: "ytd", label: "YTD", hint: "Change since the last close of December", numeric: true, render: (row) => percent(row.ytd) },
  { key: "change1y", label: "1Y", hint: "Trailing twelve-month change", numeric: true, render: (row) => percent(row.change1y) },
  {
    key: "relativeStrength",
    label: "VS SPY",
    hint: "Trailing year against the S&P 500 ETF over the same window",
    numeric: true,
    render: (row) => percent(row.relativeStrength),
  },
  {
    key: "rangePosition",
    label: "52W",
    hint: "Where the price sits in its 52-week range: 0% at the low, 100% at the high",
    numeric: true,
    render: (row) =>
      row.rangePosition === null ? (
        <span className="faint">—</span>
      ) : (
        <span className="range-cell">
          {formatPercent(row.rangePosition, 0)}
          <span className="range-track" aria-hidden="true">
            <span className="range-mark" style={{ left: `${row.rangePosition * 100}%` }} />
          </span>
        </span>
      ),
  },
  {
    key: "fromMa50",
    label: "vs MA50",
    hint: "Distance from the 50-day mean",
    numeric: true,
    render: (row) => percent(row.fromMa50),
  },
  {
    key: "fromMa200",
    label: "vs MA200",
    hint: "Distance from the 200-day mean — the conventional regime line",
    numeric: true,
    render: (row) => percent(row.fromMa200),
  },
  {
    key: "goldenCross",
    label: "CROSS",
    hint: "Golden when the 50-day mean is above the 200-day mean, death when below",
    render: (row) =>
      row.goldenCross === null ? (
        <span className="faint">—</span>
      ) : (
        <span className={row.goldenCross ? "flag ok" : "flag"}>
          {row.goldenCross ? "golden" : "death"}
        </span>
      ),
  },
  {
    key: "rsi",
    label: "RSI",
    hint: "Wilder's 14-day RSI. Below 30 is conventionally oversold, above 70 overbought",
    numeric: true,
    render: (row) =>
      row.rsi === null ? (
        <span className="faint">—</span>
      ) : (
        <span className={row.rsi >= 70 ? "negative" : row.rsi <= 30 ? "positive" : ""}>
          {formatNumber(row.rsi, 0)}
        </span>
      ),
  },
  {
    key: "volatility",
    label: "VOL",
    hint: "Annualised standard deviation of daily returns over the trailing quarter",
    numeric: true,
    render: (row) => (row.volatility === null ? <span className="faint">—</span> : formatPercent(row.volatility, 0)),
  },
  {
    key: "atrPercent",
    label: "ATR",
    hint: "Average true range over 14 days, as a share of price — a typical day's travel",
    numeric: true,
    render: (row) => (row.atrPercent === null ? <span className="faint">—</span> : formatPercent(row.atrPercent, 1)),
  },
];

type SortKey = keyof ScreenerRow;

export function Screener() {
  const [sector, setSector] = useState<string>(SP500_SECTORS[0]);
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "change1y",
    descending: true,
  });
  const [filter, setFilter] = useState("");

  const load = useCallback(async (next: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/screener?sector=${encodeURIComponent(next)}`);
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error ?? `Request failed (${response.status})`);
        return;
      }
      setData(payload as ScreenerResponse);
    } catch {
      setError("Could not reach the screener");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred a tick so the scan starts after the paint that announced it,
    // rather than cascading a render straight out of the effect.
    const timer = setTimeout(() => void load(sector));
    return () => clearTimeout(timer);
  }, [sector, load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = filter.trim().toLowerCase();
    const visible = data.rows.filter(
      (row) =>
        needle === "" ||
        row.symbol.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle),
    );

    return [...visible].sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      // Nulls sort last whichever way the column is pointing.
      if (left === null) return 1;
      if (right === null) return -1;
      if (typeof left === "string" && typeof right === "string") {
        return sort.descending ? right.localeCompare(left) : left.localeCompare(right);
      }
      return sort.descending ? Number(right) - Number(left) : Number(left) - Number(right);
    });
  }, [data, sort, filter]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key ? { key, descending: !current.descending } : { key, descending: true },
    );

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ❯
          </span>
          <h1>SCREENER</h1>
        </div>
        <Nav />
        <div className="status">
          <span className="status-chip">
            <span className={loading ? "dot busy" : "dot live"} aria-hidden="true" />
            {loading ? "SCANNING" : `${rows.length}/${data?.requested ?? 0}`}
          </span>
        </div>
      </header>

      <div className={loading ? "progress running" : "progress"} role="presentation" />

      <section className="panel screener-panel" aria-label="Screen">
        <header className="panel-title">
          <span className="title-text">S&amp;P 500 · TECHNICAL</span>
          <span className="panel-meta">
            Computed from daily prices — the provider no longer serves fundamentals unauthenticated,
            so there is no P/E or market cap here.
          </span>
        </header>

        <div className="catalog-filter screener-controls">
          <div className="family-chips" role="group" aria-label="Sector">
            {SECTORS.map((entry) => (
              <button
                type="button"
                key={entry}
                className={sector === entry ? "chip on" : "chip"}
                aria-pressed={sector === entry}
                onClick={() => setSector(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
          <div className="catalog-search">
            <span className="search-glyph" aria-hidden="true">
              ⌕
            </span>
            <input
              aria-label="Filter this sector"
              placeholder="Filter by symbol or company"
              value={filter}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
        </div>

        {error ? (
          <p className="alert" role="alert">
            <span aria-hidden="true">!</span> {error}
          </p>
        ) : null}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <button type="button" className="sort" onClick={() => toggleSort("symbol")}>
                    SYMBOL{sort.key === "symbol" ? (sort.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                {COLUMNS.map((column) => (
                  <th key={column.key} className={column.numeric ? "numeric" : ""}>
                    <button
                      type="button"
                      className="sort"
                      title={column.hint}
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.label}
                      {sort.key === column.key ? (sort.descending ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.symbol}>
                  <td>
                    {/* Every row is a way into a backtest of that instrument. */}
                    <Link className="table-strategy" href={`/?symbol=${encodeURIComponent(row.symbol)}`}>
                      <b>{row.symbol}</b> <span className="muted">{row.name}</span>
                    </Link>
                  </td>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className={column.numeric ? "numeric" : ""}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && rows.length === 0 ? (
            <p className="empty">
              <span className="empty-glyph" aria-hidden="true">
                ⌕
              </span>
              Nothing in {sector} matches that filter.
            </p>
          ) : null}
          {loading ? (
            <div className="skeleton-list" aria-hidden="true">
              {Array.from({ length: 10 }, (_, index) => (
                <div className="skeleton skeleton-row" key={index} />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
