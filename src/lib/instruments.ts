export interface Instrument {
  readonly symbol: string;
  readonly label: string;
  readonly group: string;
}

/** Presets for the symbol picker; any symbol the provider knows can still be typed in. */
export const INSTRUMENTS: readonly Instrument[] = [
  { symbol: "QQQ", label: "Nasdaq 100 ETF", group: "ETF" },
  { symbol: "SPY", label: "S&P 500 ETF", group: "ETF" },
  { symbol: "IWM", label: "Russell 2000 ETF", group: "ETF" },
  { symbol: "^GSPC", label: "S&P 500 Index", group: "INDEX" },
  { symbol: "^IXIC", label: "Nasdaq Composite", group: "INDEX" },
  { symbol: "AAPL", label: "Apple", group: "EQUITY" },
  { symbol: "MSFT", label: "Microsoft", group: "EQUITY" },
  { symbol: "NVDA", label: "NVIDIA", group: "EQUITY" },
  { symbol: "TSLA", label: "Tesla", group: "EQUITY" },
  { symbol: "BTC-USD", label: "Bitcoin", group: "CRYPTO" },
  { symbol: "ETH-USD", label: "Ethereum", group: "CRYPTO" },
  { symbol: "GC=F", label: "Gold Futures", group: "FUTURES" },
  { symbol: "CL=F", label: "Crude Oil Futures", group: "FUTURES" },
  { symbol: "EURUSD=X", label: "EUR/USD", group: "FX" },
];
