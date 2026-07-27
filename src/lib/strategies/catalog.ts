export type StrategyFamily = "trend" | "breakout" | "momentum" | "mean-reversion";

export interface StrategyParameter {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
}

export interface EvidenceReference {
  readonly title: string;
  readonly url: string;
  readonly note: string;
}

export interface StrategyMetadata {
  readonly id: string;
  readonly name: string;
  readonly family: StrategyFamily;
  readonly description: string;
  readonly parameters: readonly StrategyParameter[];
  readonly evidence: EvidenceReference;
}

const p = (key: string, label: string, value: number, min: number, max: number): StrategyParameter =>
  ({ key, label, value, min, max });

const trendEvidence: EvidenceReference = {
  title: "A Quantitative Approach to Tactical Asset Allocation",
  url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=962461",
  note: "Faber documents long-horizon moving-average trend rules across asset classes.",
};
const timeSeriesEvidence: EvidenceReference = {
  title: "Time Series Momentum",
  url: "https://doi.org/10.1016/j.jfineco.2011.11.003",
  note: "Moskowitz, Ooi, and Pedersen report persistent time-series momentum across futures markets.",
};
const donchianEvidence: EvidenceReference = {
  title: "Trading Systems and Methods",
  url: "https://www.wiley.com/en-us/Trading+Systems+and+Methods%2C+6th+Edition-p-9781119605355",
  note: "Kaufman surveys canonical channel-breakout and trend-following system construction.",
};
const crossSectionEvidence: EvidenceReference = {
  title: "Returns to Buying Winners and Selling Losers",
  url: "https://doi.org/10.1111/j.1540-6261.1993.tb04702.x",
  note: "Jegadeesh and Titman provide foundational evidence for intermediate-horizon momentum.",
};
const rsiEvidence: EvidenceReference = {
  title: "New Concepts in Technical Trading Systems",
  url: "https://books.google.com/books?id=WesJAQAAMAAJ",
  note: "Wilder introduced RSI and its conventional 14-period overbought and oversold thresholds.",
};
const bollingerEvidence: EvidenceReference = {
  title: "Bollinger on Bollinger Bands",
  url: "https://www.mheducation.com/highered/product/bollinger-on-bollinger-bands-bollinger.html",
  note: "Bollinger defines volatility envelopes using a moving average and standard deviations.",
};
const pairsEvidence: EvidenceReference = {
  title: "Pairs Trading: Performance of a Relative-Value Arbitrage Rule",
  url: "https://doi.org/10.1093/rfs/19.3.797",
  note: "Gatev, Goetzmann, and Rouwenhorst test normalized-distance mean reversion in equities.",
};

export const STRATEGY_CATALOG: readonly StrategyMetadata[] = [
  { id: "sma-10-30", name: "SMA 10 / 30 Crossover", family: "trend", description: "Follow short trends when the 10-session mean crosses the 30-session mean.", parameters: [p("fast", "Fast SMA", 10, 2, 200), p("slow", "Slow SMA", 30, 3, 400)], evidence: trendEvidence },
  { id: "sma-20-50", name: "SMA 20 / 50 Crossover", family: "trend", description: "Follow medium trends using conventional one-month and quarter-length averages.", parameters: [p("fast", "Fast SMA", 20, 2, 200), p("slow", "Slow SMA", 50, 3, 400)], evidence: trendEvidence },
  { id: "sma-50-200", name: "SMA 50 / 200 Crossover", family: "trend", description: "Use the widely followed golden-cross and death-cross long-horizon filter.", parameters: [p("fast", "Fast SMA", 50, 2, 200), p("slow", "Slow SMA", 200, 3, 400)], evidence: trendEvidence },
  { id: "sma-100-200", name: "SMA 100 / 200 Crossover", family: "trend", description: "Track slow-moving persistent trends while limiting short-term switching noise.", parameters: [p("fast", "Fast SMA", 100, 2, 200), p("slow", "Slow SMA", 200, 3, 400)], evidence: trendEvidence },
  { id: "donchian-20", name: "Donchian 20 Breakout", family: "breakout", description: "Enter on a new 20-session closing high and exit on a new closing low.", parameters: [p("lookback", "Channel lookback", 20, 2, 252)], evidence: donchianEvidence },
  { id: "donchian-55", name: "Donchian 55 Breakout", family: "breakout", description: "Capture longer trends with a classic 55-session price-channel breakout.", parameters: [p("lookback", "Channel lookback", 55, 2, 252)], evidence: donchianEvidence },
  { id: "donchian-100", name: "Donchian 100 Breakout", family: "breakout", description: "Trade infrequent extensions beyond the previous 100-session closing range.", parameters: [p("lookback", "Channel lookback", 100, 2, 252)], evidence: donchianEvidence },
  { id: "momentum-21", name: "One-Month Momentum", family: "momentum", description: "Hold long or short according to the sign of the trailing 21-session return.", parameters: [p("lookback", "Return lookback", 21, 2, 252)], evidence: timeSeriesEvidence },
  { id: "momentum-63", name: "Three-Month Momentum", family: "momentum", description: "Use the sign of the trailing 63-session return as a directional signal.", parameters: [p("lookback", "Return lookback", 63, 2, 252)], evidence: timeSeriesEvidence },
  { id: "momentum-126", name: "Six-Month Momentum", family: "momentum", description: "Use a half-year trailing return to identify persistent directional movement.", parameters: [p("lookback", "Return lookback", 126, 2, 252)], evidence: crossSectionEvidence },
  { id: "momentum-252", name: "Twelve-Month Momentum", family: "momentum", description: "Use the sign of the trailing 252-session return for slow trend exposure.", parameters: [p("lookback", "Return lookback", 252, 2, 504)], evidence: timeSeriesEvidence },
  { id: "rsi-14-30-70", name: "RSI 14 Mean Reversion", family: "mean-reversion", description: "Buy below 30 and sell above 70 using Wilder's standard RSI configuration.", parameters: [p("period", "RSI period", 14, 2, 100), p("lower", "Oversold", 30, 1, 49), p("upper", "Overbought", 70, 51, 99)], evidence: rsiEvidence },
  { id: "rsi-7-20-80", name: "Fast RSI Extremes", family: "mean-reversion", description: "React to short-horizon exhaustion at stricter 20 and 80 RSI extremes.", parameters: [p("period", "RSI period", 7, 2, 100), p("lower", "Oversold", 20, 1, 49), p("upper", "Overbought", 80, 51, 99)], evidence: rsiEvidence },
  { id: "rsi-21-35-65", name: "Slow RSI Mean Reversion", family: "mean-reversion", description: "Use a smoother RSI with moderate thresholds for slower reversal signals.", parameters: [p("period", "RSI period", 21, 2, 100), p("lower", "Oversold", 35, 1, 49), p("upper", "Overbought", 65, 51, 99)], evidence: rsiEvidence },
  { id: "bollinger-20-2", name: "Bollinger 20 / 2 Reversion", family: "mean-reversion", description: "Fade closes outside a 20-session envelope placed two deviations from its mean.", parameters: [p("period", "Mean period", 20, 2, 252), p("deviations", "Standard deviations", 2, 0.5, 5)], evidence: bollingerEvidence },
  { id: "bollinger-10-1.5", name: "Fast Bollinger Reversion", family: "mean-reversion", description: "Target quick reversals with a short mean and a narrower volatility envelope.", parameters: [p("period", "Mean period", 10, 2, 252), p("deviations", "Standard deviations", 1.5, 0.5, 5)], evidence: bollingerEvidence },
  { id: "bollinger-50-2.5", name: "Slow Bollinger Reversion", family: "mean-reversion", description: "Target substantial departures from a stable 50-session rolling baseline.", parameters: [p("period", "Mean period", 50, 2, 252), p("deviations", "Standard deviations", 2.5, 0.5, 5)], evidence: bollingerEvidence },
  { id: "zscore-20-2", name: "Z-Score 20 / 2 Reversion", family: "mean-reversion", description: "Fade normalized price deviations beyond two population standard deviations.", parameters: [p("period", "Z-score period", 20, 2, 252), p("threshold", "Entry z-score", 2, 0.5, 5)], evidence: pairsEvidence },
  { id: "zscore-60-2", name: "Z-Score 60 / 2 Reversion", family: "mean-reversion", description: "Measure price displacement against a slower 60-session normalized baseline.", parameters: [p("period", "Z-score period", 60, 2, 252), p("threshold", "Entry z-score", 2, 0.5, 5)], evidence: pairsEvidence },
  { id: "zscore-120-2.5", name: "Z-Score 120 / 2.5 Reversion", family: "mean-reversion", description: "Trade only large normalized deviations from a long-run rolling price baseline.", parameters: [p("period", "Z-score period", 120, 2, 252), p("threshold", "Entry z-score", 2.5, 0.5, 5)], evidence: pairsEvidence },
] as const;
