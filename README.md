# Strategy Lab

A research terminal that backtests twenty published trading strategies on real historical market data.

## What it does

- **The answer first.** Every run opens with a sentence — which rule won, what it returned, and what simply holding the asset returned over the same bars and costs — followed by the caveats that apply to it. The ratios are underneath, where they belong.
- **Real data.** OHLCV is fetched from Yahoo Finance for any symbol it serves — ETFs, indices (`^GSPC`), equities, crypto (`BTC-USD`), futures (`GC=F`), FX (`EURUSD=X`) — across 5m, 15m, 1h, 4h, 1D, 1W and 1M. 4h bars are deterministically resampled from 1h; intraday history is bounded by what the provider offers.
- **Deterministic engine.** Signals are read at the bar close and executed at the next bar open, so no decision uses a price it could not have seen. Commission, slippage, position sizing, stop-loss and take-profit are configurable. A bar touching both the stop and the target is assumed to have hit the stop first, and any position still open at the end is liquidated at the last close.
- **20 strategies** across trend, breakout, momentum and mean reversion — SMA/EMA crossovers, MACD, ADX-filtered trend, Donchian and ATR channels, time-series and dual momentum, RSI, stochastic, Bollinger, z-score and envelope reversion, and a volatility-filtered trend rule. Each carries its published reference, its warm-up requirement, and bounded editable parameters. Defaults are the conventional published values, never fitted to the featured assets.
- **Honest reporting.** Every run is split into in-sample and out-of-sample halves, compared against buy-and-hold on the same bars and costs, and flagged when the sample is too small, exposure too thin, or out-of-sample Sharpe collapses against in-sample.
- **Working terminal.** The Hermes panel is a real command console: `run BTC-USD 4h`, `set stop 5`, `range 2023-01-01 2024-01-01`, `rank sharpe calmar`, `explain rsi-14-30-70`, `top 10`, `export csv`. Tab completes, ↑ recalls, `help` lists everything.
- **Command palette.** `⌘K` reaches every market, timeframe, strategy, ranking metric and setting by name, dispatching into the same handlers the terminal does. `/` focuses the symbol, `` ` `` the command line, `?` prints the reference.
- **Playback.** Scrub or play the finished backtest bar by bar; the chart, metrics, leaderboard and trade log all follow the cursor. The scrubber is drawn over a miniature of the equity curve, so you can see the drawdown you are scrubbing into. Respects `prefers-reduced-motion`.
- **Two themes, three densities.** Colour resolves through semantic tokens, so light mode is a token swap rather than a second stylesheet — the chart reads the same values. Both preferences are applied before first paint, so a reload never flashes.
- **Persistence.** Supabase caches fetched price series per symbol and timeframe and records run history. Both are optional: without credentials the app falls back to an in-process cache and simply shows no history.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Supabase is optional; to enable it, put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. The service-role key is read only on the server (`src/lib/db.ts`) and never reaches the browser — both tables have RLS enabled with no policies.

## Verify

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

## Deployment

Deployed to Vercel, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set as environment variables there.

## Limitations

Backtests are historical simulations, not evidence that a rule will work. Results ignore taxes and short borrowing costs, assume fills at the modelled prices, and use provider data whose corporate-action treatment varies by asset class. There is no authentication, and user-written custom strategies are not supported.

Educational use only; not financial advice. This app does not place trades.

## License

MIT
