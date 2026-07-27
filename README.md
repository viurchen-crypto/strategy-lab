# Strategy Lab

A research terminal for learning how trading strategies work: it backtests thirty published
rules on real historical market data, screens the S&P 500 on current prices, and carries a
tutor that answers from whatever is on screen.

## What it does

- **The answer first.** Every run opens with a sentence — which rule won, what it returned, and what simply holding the asset returned over the same bars and costs — followed by the caveats that apply to it. The ratios are underneath, where they belong.
- **Real data.** OHLCV is fetched from Yahoo Finance for any symbol it serves — ETFs, indices (`^GSPC`), equities, crypto (`BTC-USD`), futures (`GC=F`), FX (`EURUSD=X`) — across 5m, 15m, 1h, 4h, 1D, 1W and 1M. 4h bars are deterministically resampled from 1h; intraday history is bounded by what the provider offers.
- **Deterministic engine.** Signals are read at the bar close and executed at the next bar open, so no decision uses a price it could not have seen. Commission, slippage, position sizing, stop-loss and take-profit are configurable. A bar touching both the stop and the target is assumed to have hit the stop first, and any position still open at the end is liquidated at the last close.
- **30 strategies** across four holding horizons — daily, swing, position and long term — and four families: trend, breakout, momentum and mean reversion — SMA/EMA crossovers, MACD, ADX-filtered trend, Donchian and ATR channels, time-series and dual momentum, RSI, stochastic, Bollinger, z-score and envelope reversion, and a volatility-filtered trend rule. Each carries its published reference, its warm-up requirement, and bounded editable parameters. Defaults are the conventional published values, never fitted to the featured assets.
- **Honest reporting.** Every run is split into in-sample and out-of-sample halves, compared against buy-and-hold on the same bars and costs, and flagged when the sample is too small, exposure too thin, or out-of-sample Sharpe collapses against in-sample.
- **Working terminal.** The command line is a real console: `run BTC-USD 4h`, `set stop 5`, `range 2023-01-01 2024-01-01`, `rank sharpe calmar`, `explain rsi-14-30-70`, `top 10`, `export csv`. Tab completes, ↑ recalls, `help` lists everything.
- **A resident tutor.** The command line does double duty: a leading `/` or a known verb runs a command, anything else is a question for Hermes. It is handed the leaderboard, the selected strategy's metrics and its caveats on every turn, so it answers from this run's numbers rather than from generic market lore — and it defines the vocabulary as it goes. The chat window drags anywhere, collapses to a bubble, and remembers where you left it.
- **Actions, safely.** Hermes may offer things to do, but only as lines of the terminal's own command language, validated by the same parser a typed command goes through. There is no syntax for anything else, so the model reaches no filesystem, no shell and no network from inside the app. You click to apply; nothing happens otherwise.
- **A learning page.** A glossary of the technical vocabulary — each term with the misreading it invites — the full catalog with its published references, and the tutor beside both.
- **A technical screener.** The S&P 500 by sector plus the major cryptocurrencies, with trailing changes, 52-week range position, distance from the 50- and 200-day means, golden/death cross, RSI, ATR, volatility and relative strength against SPY. Every row clicks through to a backtest of that symbol.
- **Compare mode.** Up to five equity curves at once, distinctly coloured, with the focused strategy keeping its trade markers.
- **Command palette.** `⌘K` reaches every market, timeframe, strategy, ranking metric and setting by name, dispatching into the same handlers the terminal does. `/` focuses the symbol, `` ` `` the command line, `?` prints the reference.
- **Playback.** Scrub or play the finished backtest bar by bar; the chart, metrics, leaderboard and trade log all follow the cursor. The scrubber is drawn over a miniature of the equity curve, so you can see the drawdown you are scrubbing into. Respects `prefers-reduced-motion`.
- **Two themes, three densities.** Colour resolves through semantic tokens, so light mode is a token swap rather than a second stylesheet — the chart reads the same values. Both preferences are applied before first paint, so a reload never flashes.
- **Persistence.** Supabase caches fetched price series per symbol and timeframe and records run history. Both are optional: without credentials the app falls back to an in-process cache and simply shows no history.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

**Hermes is local-only.** The tutor talks to Hermes through the OpenAI-compatible proxy it
already uses for its own inference, on `http://127.0.0.1:10531/v1` — loopback, on this machine.
A deployed build has no Hermes to reach and says so plainly instead of hanging; everything else
works identically in both places. Override the address with `HERMES_BASE_URL` and the model with
`HERMES_MODEL`.

Supabase is optional; to enable it, put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. The service-role key is read only on the server (`src/lib/db.ts`) and never reaches the browser — both tables have RLS enabled with no policies.

## Verify

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

## Deployment

Deployed to Vercel, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set as environment variables there.

## Regenerating the universe

```bash
npx tsx scripts/build-universe.ts
```

Rewrites `src/lib/universe/sp500.ts` from the public constituents dataset. Run it by hand and
commit the result — an index that changes a few times a year should not be a build-time network
dependency.

## Limitations

The screener is **technical only**. The price provider's quote and fundamentals endpoints now
refuse unauthenticated requests, so there is no P/E, no market cap and no earnings data here;
everything shown is computed from daily OHLCV.

Backtests are historical simulations, not evidence that a rule will work. Results ignore taxes and short borrowing costs, assume fills at the modelled prices, and use provider data whose corporate-action treatment varies by asset class. There is no authentication, and user-written custom strategies are not supported.

Educational use only; not financial advice. This app does not place trades.

## License

MIT
