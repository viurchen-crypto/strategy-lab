import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BacktestResponse } from "@/lib/engine";
import Home from "./page";

// The chart renders to a canvas the test environment does not provide, and it is
// not what these tests are about.
vi.mock("./price-chart", () => ({
  PriceChart: ({ strategy, cursor }: { strategy: { name: string }; cursor: number }) => (
    <div>
      chart:{strategy.name}:{cursor}
    </div>
  ),
}));

const metrics = (totalReturn: number, sharpe: number) => ({
  netPnl: totalReturn * 10_000,
  totalReturn,
  cagr: totalReturn / 2,
  sharpe,
  sortino: sharpe * 1.2,
  volatility: 0.18,
  maxDrawdown: 0.12,
  calmar: 0.9,
  winRate: 0.55,
  profitFactor: 1.4,
  expectancy: 42,
  tradeCount: 12,
  exposure: 0.8,
});

const response: BacktestResponse = {
  symbol: "QQQ",
  name: "Invesco QQQ Trust",
  currency: "USD",
  exchange: "NasdaqGM",
  timeframe: "1D",
  source: "provider",
  fetchedAt: new Date().toISOString(),
  periodStart: 1_700_000_000,
  periodEnd: 1_700_172_800,
  barCount: 3,
  periodsPerYear: 252,
  bars: [
    [1_700_000_000, 100, 101, 99, 100],
    [1_700_086_400, 100, 106, 100, 105],
    [1_700_172_800, 105, 112, 104, 110],
  ],
  splitIndex: 1,
  notes: ["Warm-up history is shorter than the slowest strategy needs"],
  benchmark: { equity: [10_000, 10_500, 11_000], metrics: metrics(0.05, 0.4) },
  strategies: [
    {
      id: "sma-10-30",
      code: "01",
      name: "SMA 10/30 Cross",
      family: "trend",
      description: "Short trend filter.",
      parameters: { fast: 10, slow: 30 },
      metrics: metrics(0.1, 0.8),
      equity: [10_000, 11_000, 11_500],
      trades: [
        {
          side: "long",
          entryTime: 1_700_000_000,
          entryPrice: 100,
          exitTime: 1_700_086_400,
          exitPrice: 105,
          pnl: 500,
          return: 0.05,
          exitReason: "signal",
        },
        {
          side: "short",
          entryTime: 1_700_086_400,
          entryPrice: 105,
          exitTime: 1_700_172_800,
          exitPrice: 110,
          pnl: -300,
          return: -0.03,
          exitReason: "stop",
        },
      ],
      truncatedTrades: 0,
      score: 90,
      inSample: metrics(0.2, 1.6),
      outOfSample: metrics(-0.05, 0.1),
      warnings: ["Only 2 trades: too few to be statistically meaningful"],
    },
    {
      id: "donchian-20",
      code: "04",
      name: "Donchian 20 Breakout",
      family: "breakout",
      description: "Channel breakout.",
      parameters: { lookback: 20 },
      metrics: metrics(0.3, 1.5),
      equity: [10_000, 13_000, 13_500],
      trades: [],
      truncatedTrades: 0,
      score: 95,
      warnings: [],
    },
  ],
};

const stubFetch = (backtest: () => Response) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/runs"
        ? new Response(JSON.stringify({ runs: [], configured: true }), { status: 200 })
        : backtest(),
    ),
  );

beforeEach(() => {
  stubFetch(() => new Response(JSON.stringify(response), { status: 200 }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const command = async (text: string) => {
  const input = screen.getByLabelText("Terminal command");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input);
};

/** The strategy name also appears in the leaderboard, so scope clicks to the catalog. */
const findInCatalog = (container: HTMLElement, name: string) =>
  waitFor(() => {
    const list = container.querySelector(".strategy-list");
    expect(list?.querySelectorAll(".strategy").length).toBeGreaterThan(0);
    return within(list as HTMLElement).getByText(name);
  });

describe("strategy dashboard", () => {
  it("renders every panel of the terminal layout", async () => {
    render(<Home />);
    await screen.findByText(/\[ STRATEGIES \]/);
    for (const panel of [
      "MARKET PLAYBACK",
      "PERFORMANCE",
      "PARAMETERS",
      "LEADERBOARD",
      "TRADE LOG",
      "HERMES TERMINAL",
      "HISTORY",
    ]) {
      expect(screen.getByText(`[ ${panel} ]`)).toBeTruthy();
    }
  });

  it("offers every supported timeframe", () => {
    render(<Home />);
    for (const timeframe of ["5m", "15m", "1h", "4h", "1D", "1W", "1M"]) {
      expect(screen.getByRole("button", { name: timeframe })).toBeTruthy();
    }
  });

  it("requests a backtest on load and lists the returned strategies", async () => {
    const { container } = render(<Home />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/backtest", expect.anything()));
    const list = await waitFor(() => {
      const element = container.querySelector(".strategy-list");
      expect(element?.childElementCount).toBe(2);
      return element as HTMLElement;
    });
    expect(within(list).getByText("SMA 10/30 Cross")).toBeTruthy();
    expect(within(list).getByText("Donchian 20 Breakout")).toBeTruthy();
  });

  it("orders the leaderboard by score, best first", async () => {
    render(<Home />);
    const table = await screen.findByRole("table");
    const rows = await waitFor(() => {
      // The header row is present from the start; wait for the results to land.
      const all = within(table).getAllByRole("row").slice(1);
      expect(all).toHaveLength(2);
      return all;
    });
    expect(within(rows[0]).getByText("Donchian 20 Breakout")).toBeTruthy();
    expect(within(rows[1]).getByText("SMA 10/30 Cross")).toBeTruthy();
  });

  it("shows the out-of-sample split and the strategy warnings", async () => {
    const { container } = render(<Home />);
    await screen.findByText("OUT-OF-SAMPLE");
    fireEvent.click(await findInCatalog(container, "SMA 10/30 Cross"));
    expect(screen.getByText(/too few to be statistically meaningful/)).toBeTruthy();
    expect(screen.getByText(/Warm-up history is shorter/)).toBeTruthy();
  });

  it("surfaces the error message when the backtest fails", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'Unknown symbol "ZZZZ"' }), { status: 404 }));
    render(<Home />);
    expect(await screen.findByRole("alert")).toHaveTextContent('Unknown symbol "ZZZZ"');
  });

  it("runs a terminal command that reconfigures and refetches", async () => {
    render(<Home />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/backtest", expect.anything()));
    await command("symbol BTC-USD");

    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
      const last = calls.filter(([url]) => url === "/api/backtest").at(-1);
      expect(JSON.parse(String(last?.[1]?.body))).toMatchObject({ symbol: "BTC-USD" });
    });
    expect(screen.getByLabelText("Symbol")).toHaveValue("BTC-USD");
  });

  it("reports an unknown command without refetching", async () => {
    render(<Home />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/backtest", expect.anything()));
    const before = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await command("frobnicate");
    expect(await screen.findByText(/Unknown command/)).toBeTruthy();
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(before);
  });

  it("hides trades that have not been reached by the playback cursor", async () => {
    const { container } = render(<Home />);
    fireEvent.click(await findInCatalog(container, "SMA 10/30 Cross"));
    await waitFor(() => expect(container.querySelectorAll(".log-line")).toHaveLength(2));

    fireEvent.change(screen.getByLabelText("Playback position"), { target: { value: "1" } });
    await waitFor(() => expect(container.querySelectorAll(".log-line")).toHaveLength(1));
  });
});
