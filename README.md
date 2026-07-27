# Strategy Lab

A terminal-style educational dashboard for exploring historical trading strategies.

Current prototype:
- Deterministic long/short backtest engine with next-bar execution, fees, slippage, P&L, Sharpe, and max drawdown.
- 20 transparent, evidence-informed built-in strategy definitions.
- TradingView-style timeframe controls from 5m to 1M.
- Terminal dashboard prototype with playback, leaderboard, trade log, and Hermes strategy-request panel.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Verify

```bash
npx vitest run --environment jsdom
npm run lint
npm run build
```

## Status and limitations

This public deployment is a visual/engine prototype. Authentication, real market-data retrieval, persistent storage, and the custom-strategy approval bridge are not yet connected. It uses illustrative dashboard values and does not place trades.

Educational use only; not financial advice.

## Deployment

The app is deployed from GitHub through Vercel. Environment secrets are intentionally not required for the current prototype.

Future work will add secure login and Supabase persistence before any user-specific data is stored.

## License

MIT
