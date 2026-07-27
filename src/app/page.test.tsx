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
      horizon: "daily",
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
      horizon: "position",
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

/** Hermes is a local-only bridge, so tests answer for it rather than reaching it. */
const hermesReply = (text: string) =>
  new Response(`event: delta\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: {}\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });

const stubFetch = (backtest: () => Response) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/runs") {
        return new Response(JSON.stringify({ runs: [], configured: true }), { status: 200 });
      }
      if (url === "/api/hermes") {
        return hermesReply("A Sharpe ratio is return per unit of volatility.");
      }
      return backtest();
    }),
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

const openTab = (name: RegExp) => fireEvent.click(screen.getByRole("tab", { name }));

describe("strategy dashboard", () => {
  it("renders the always-visible panels and the workspace tabs", async () => {
    render(<Home />);
    await screen.findByText("STRATEGIES");
    for (const panel of ["MARKET", "PERFORMANCE"]) {
      expect(screen.getByRole("region", { name: panel })).toBeTruthy();
    }
    for (const tab of ["LEADERBOARD", "TRADE LOG", "TUNING", "HISTORY", "TERMINAL"]) {
      expect(screen.getByRole("tab", { name: new RegExp(tab) })).toBeTruthy();
    }
    // The leaderboard is what a first-time viewer needs, so it opens on it.
    expect(screen.getByRole("tab", { name: /LEADERBOARD/ })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the execution settings collapsed behind a summary", async () => {
    render(<Home />);
    expect(screen.queryByLabelText("Commission in basis points")).toBeNull();
    expect(screen.getByText("100% size")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /EXECUTION/ }));
    expect(screen.getByLabelText("Commission in basis points")).toBeTruthy();
    expect(screen.getByLabelText("Window start date")).toBeTruthy();
  });

  it("never sends a half-typed number to the engine", async () => {
    render(<Home />);
    await screen.findAllByText("SMA 10/30 Cross");
    fireEvent.click(screen.getByRole("button", { name: /EXECUTION/ }));

    const capital = screen.getByLabelText("Initial capital");
    // Clearing the box used to commit Number("") === 0 and the run came back
    // "Too small: expected number to be >0".
    fireEvent.change(capital, { target: { value: "" } });
    expect(capital).toHaveValue(null);
    fireEvent.change(capital, { target: { value: "2" } });
    fireEvent.change(capital, { target: { value: "25" } });
    fireEvent.change(capital, { target: { value: "25000" } });

    fireEvent.click(screen.getByRole("button", { name: /APPLY CHANGES/ }));
    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
      const last = calls.filter(([url]) => url === "/api/backtest").at(-1);
      expect(JSON.parse(String(last?.[1]?.body))).toMatchObject({ initialCapital: 25_000 });
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps an out-of-range entry out of the request", async () => {
    render(<Home />);
    await screen.findAllByText("SMA 10/30 Cross");
    fireEvent.click(screen.getByRole("button", { name: /EXECUTION/ }));

    const size = screen.getByLabelText("Position size percent");
    fireEvent.change(size, { target: { value: "400" } });
    fireEvent.blur(size);
    // 400% is refused, so the field snaps back to the last good value.
    expect(size).toHaveValue(100);
  });

  it("replays the window from the start when play is pressed at the end", async () => {
    render(<Home />);
    await screen.findAllByText("SMA 10/30 Cross");
    const slider = screen.getByLabelText("Playback position");
    await waitFor(() => expect(slider).toHaveValue("2"));

    // At the end the control offers a replay rather than doing nothing.
    const play = screen.getByRole("button", { name: /REPLAY/ });
    fireEvent.click(play);
    expect(slider).toHaveValue("0");
    expect(screen.getByRole("button", { name: /PAUSE/ })).toBeTruthy();
  });

  it("marks the run button when the form is ahead of the results", async () => {
    render(<Home />);
    await screen.findAllByText("SMA 10/30 Cross");
    expect(screen.getByRole("button", { name: /RUN BACKTEST/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /EXECUTION/ }));
    fireEvent.change(screen.getByLabelText("Commission in basis points"), { target: { value: "25" } });

    const apply = await screen.findByRole("button", { name: /APPLY CHANGES/ });
    fireEvent.click(apply);
    await waitFor(() => expect(screen.getByRole("button", { name: /RUN BACKTEST/ })).toBeTruthy());
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
      // Scores are measured off a deferred cursor, so the order settles a tick later.
      const all = within(table).getAllByRole("row").slice(1);
      expect(all).toHaveLength(2);
      expect(within(all[0]).queryByText("Donchian 20 Breakout")).toBeTruthy();
      return all;
    });
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

  it("reports an unknown slash command without refetching", async () => {
    render(<Home />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/backtest", expect.anything()));
    const before = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    // The slash is what makes it a command; without it this would be a question.
    await command("/frobnicate");
    expect(await screen.findByText(/Unknown command/)).toBeTruthy();
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(before);
  });

  it("sends plain English to Hermes instead of erroring on it", async () => {
    render(<Home />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/backtest", expect.anything()));

    await command("what is a sharpe ratio");

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/hermes", expect.objectContaining({ method: "POST" })),
    );
    // The answer lands in the chat window, which the question opened.
    expect(await screen.findByText(/return per unit of volatility/)).toBeTruthy();
    expect(screen.queryByText(/Unknown command/)).toBeNull();
  });

  it("gives Hermes the run's actual numbers to answer from", async () => {
    const { container } = render(<Home />);
    // The context follows the selection, so pick the flagged strategy first.
    fireEvent.click(await findInCatalog(container, "SMA 10/30 Cross"));
    await command("is that any good");

    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
      const last = calls.filter(([url]) => url === "/api/hermes").at(-1);
      const body = JSON.parse(String(last?.[1]?.body));
      expect(body.context).toContain("QQQ");
      expect(body.context).toContain("Donchian 20 Breakout");
      // The caveats are the most useful thing it can bring up, so they travel too.
      expect(body.context).toContain("too few to be statistically meaningful");
      expect(body.messages.at(-1)).toMatchObject({ role: "user", content: "is that any good" });
    });
  });

  it("hides trades that have not been reached by the playback cursor", async () => {
    const { container } = render(<Home />);
    fireEvent.click(await findInCatalog(container, "SMA 10/30 Cross"));
    openTab(/TRADE LOG/);
    await waitFor(() => expect(container.querySelectorAll(".log-line")).toHaveLength(2));

    fireEvent.change(screen.getByLabelText("Playback position"), { target: { value: "1" } });
    await waitFor(() => expect(container.querySelectorAll(".log-line")).toHaveLength(1));
  });

  it("keeps the last successful results visible when a rerun fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/runs") {
          return new Response(JSON.stringify({ runs: [], configured: true }), { status: 200 });
        }
        const request = JSON.parse(String(init?.body)) as { symbol: string };
        return request.symbol === "NOPE"
          ? new Response(JSON.stringify({ error: 'Unknown symbol "NOPE"' }), { status: 404 })
          : new Response(JSON.stringify(response), { status: 200 });
      }),
    );
    render(<Home />);
    await screen.findAllByText("SMA 10/30 Cross");

    const symbol = screen.getByLabelText("Symbol");
    fireEvent.change(symbol, { target: { value: "NOPE" } });
    fireEvent.submit(symbol);

    expect(await screen.findByRole("alert")).toHaveTextContent('Unknown symbol "NOPE"');
    expect(screen.getAllByText("SMA 10/30 Cross").length).toBeGreaterThan(0);
    expect(screen.getByText(/Showing the last successful run/)).toBeTruthy();
  });

  it("leads with a plain-language verdict on the run", async () => {
    render(<Home />);
    await screen.findAllByText("SMA 10/30 Cross");
    const verdict = screen.getByRole("region", { name: "Run summary" });
    // The leader, not the first strategy in the catalog, is what the run found.
    await waitFor(() => expect(verdict).toHaveTextContent(/Donchian 20 Breakout returned \+30.0%/));
    expect(verdict).toHaveTextContent(/buy & hold returned \+5.0%/);
    expect(verdict).toHaveTextContent(/No caveats flagged/);
  });

  it("narrows the catalog by family and by search without touching the ranking", async () => {
    const { container } = render(<Home />);
    await waitFor(() =>
      expect(container.querySelectorAll(".strategy-list .strategy")).toHaveLength(2),
    );

    fireEvent.click(screen.getByRole("button", { name: "Breakout" }));
    await waitFor(() =>
      expect(container.querySelectorAll(".strategy-list .strategy")).toHaveLength(1),
    );
    // Filtering is a view of the catalog, so the leaderboard still ranks all of them.
    expect(within(screen.getByRole("table")).getAllByRole("row").slice(1)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Breakout" }));
    fireEvent.change(screen.getByLabelText("Filter strategies"), { target: { value: "sma" } });
    await waitFor(() => {
      const list = container.querySelector(".strategy-list") as HTMLElement;
      expect(within(list).getByText("SMA 10/30 Cross")).toBeTruthy();
      expect(within(list).queryByText("Donchian 20 Breakout")).toBeNull();
    });
  });

  it("opens the command palette with the keyboard and runs an action from it", async () => {
    render(<Home />);
    await screen.findAllByText("SMA 10/30 Cross");

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const search = await screen.findByLabelText("Search commands");

    fireEvent.change(search, { target: { value: "bitcoin" } });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });

    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
      const last = calls.filter(([url]) => url === "/api/backtest").at(-1);
      expect(JSON.parse(String(last?.[1]?.body))).toMatchObject({ symbol: "BTC-USD" });
    });
    // Running an action closes the palette.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("switches the theme on the document root", async () => {
    render(<Home />);
    await screen.findAllByText("SMA 10/30 Cross");
    expect(document.documentElement.dataset.theme).not.toBe("light");

    fireEvent.click(screen.getByRole("button", { name: /Switch theme/ }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("sl-theme")).toBe("light");
  });

  it("exposes interactive state and keyboard controls accessibly", async () => {
    render(<Home />);
    await screen.findAllByText("SMA 10/30 Cross");
    expect(screen.getByRole("button", { name: "1D" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Buy and hold benchmark/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The catalog row, its compare toggle, and the leaderboard row.
    expect(screen.getAllByRole("button", { name: /Donchian 20 Breakout/i })).toHaveLength(3);
    openTab(/TUNING/);
    expect(screen.getByRole("button", { name: "Export selected strategy trades as CSV" })).toBeTruthy();
  });
});
