export type StrategyFamily = "trend" | "breakout" | "momentum" | "mean-reversion";

/**
 * The holding period a rule was published for. A 10/30 SMA on daily bars and a
 * 10-month SMA on monthly bars are not the same rule at different zoom levels —
 * they were researched separately and behave differently — so the horizon is an
 * axis of the catalog rather than a view of it.
 *
 * "all" is not a horizon a strategy carries; it is the absence of a filter.
 */
export const HORIZONS = ["daily", "swing", "position", "long", "all"] as const;
export type Horizon = (typeof HORIZONS)[number];
export type StrategyHorizon = Exclude<Horizon, "all">;

/** The bar size each horizon is meant to be traded on. */
export const HORIZON_TIMEFRAME: Record<StrategyHorizon, "1D" | "1W" | "1M"> = {
  daily: "1D",
  swing: "1D",
  position: "1W",
  long: "1M",
};

export const HORIZON_LABELS: Record<Horizon, string> = {
  daily: "Daily",
  swing: "Swing",
  position: "Position",
  long: "Long term",
  all: "All",
};

/** Signal generator a strategy dispatches to. Kept as a tag so the catalog stays serializable. */
export type StrategyKind =
  | "sma"
  | "ema"
  | "trend-filter"
  | "macd"
  | "adx"
  | "donchian"
  | "atr-channel"
  | "momentum"
  | "dual-momentum"
  | "vol-trend"
  | "rsi"
  | "stochastic"
  | "bollinger"
  | "zscore"
  | "envelope";

export interface StrategyParameter {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface EvidenceReference {
  readonly title: string;
  readonly url: string;
  readonly note: string;
}

export interface StrategyMetadata {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: StrategyKind;
  readonly family: StrategyFamily;
  readonly horizon: StrategyHorizon;
  readonly description: string;
  /** Bars of history the signal needs before it can take a position. */
  readonly warmup: number;
  readonly parameters: readonly StrategyParameter[];
  readonly evidence: EvidenceReference;
}

const p = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step = 1,
): StrategyParameter => ({ key, label, value, min, max, step });

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
const crossSectionEvidence: EvidenceReference = {
  title: "Returns to Buying Winners and Selling Losers",
  url: "https://doi.org/10.1111/j.1540-6261.1993.tb04702.x",
  note: "Jegadeesh and Titman provide foundational evidence for intermediate-horizon momentum.",
};
const donchianEvidence: EvidenceReference = {
  title: "Trading Systems and Methods",
  url: "https://www.wiley.com/en-us/Trading+Systems+and+Methods%2C+6th+Edition-p-9781119605355",
  note: "Kaufman surveys canonical channel-breakout and trend-following system construction.",
};
const rsiEvidence: EvidenceReference = {
  title: "New Concepts in Technical Trading Systems",
  url: "https://books.google.com/books?id=WesJAQAAMAAJ",
  note: "Wilder introduced RSI and its conventional overbought and oversold thresholds.",
};
const bollingerEvidence: EvidenceReference = {
  title: "Bollinger on Bollinger Bands",
  url: "https://www.mheducation.com/highered/product/bollinger-on-bollinger-bands-bollinger.html",
  note: "Bollinger defines volatility envelopes using a moving average and standard deviations.",
};

const macdEvidence: EvidenceReference = {
  title: "Technical Analysis of the Financial Markets",
  url: "https://www.penguinrandomhouse.com/books/330733/technical-analysis-of-the-financial-markets-by-john-j-murphy/",
  note: "Murphy documents Appel's MACD construction and its conventional 12/26/9 settings.",
};
const adxEvidence: EvidenceReference = {
  title: "New Concepts in Technical Trading Systems",
  url: "https://books.google.com/books?id=WesJAQAAMAAJ",
  note: "Wilder introduced ADX and the directional movement index as a trend-strength filter.",
};
const stochasticEvidence: EvidenceReference = {
  title: "Technical Analysis of the Financial Markets",
  url: "https://www.penguinrandomhouse.com/books/330733/technical-analysis-of-the-financial-markets-by-john-j-murphy/",
  note: "Murphy sets out Lane's stochastic oscillator and its 20/80 reversal thresholds.",
};
const reversionEvidence: EvidenceReference = {
  title: "Do Stock Prices Move Too Much to be Justified by Subsequent Changes in Dividends?",
  url: "https://www.jstor.org/stable/1802789",
  note: "Shiller's excess-volatility result underpins the case for mean reversion in prices.",
};
const volTargetEvidence: EvidenceReference = {
  title: "Volatility Managed Portfolios",
  url: "https://doi.org/10.1111/jofi.12513",
  note: "Moreira and Muir show scaling exposure down in high-volatility regimes improves risk-adjusted returns.",
};
const fiftyTwoWeekEvidence: EvidenceReference = {
  title: "The 52-Week High and Momentum Investing",
  url: "https://doi.org/10.1111/j.1540-6261.2004.00695.x",
  note: "George and Hwang find nearness to the 52-week high predicts returns better than past return itself.",
};
const stageEvidence: EvidenceReference = {
  title: "Secrets for Profiting in Bull and Bear Markets",
  url: "https://www.mhprofessional.com/secrets-for-profiting-in-bull-and-bear-markets-9781556236839-usa",
  note: "Weinstein's stage analysis uses the 30-week moving average to separate accumulation from decline.",
};
const dualMomentumEvidence: EvidenceReference = {
  title: "Dual Momentum Investing",
  url: "https://www.mhprofessional.com/dual-momentum-investing-an-innovative-strategy-for-higher-returns-with-lower-risk-9780071849449-usa",
  note: "Antonacci combines absolute and relative momentum before taking directional exposure.",
};

/**
 * Twenty published rules spanning trend, breakout, momentum, and mean reversion,
 * so a single run shows how each family behaves on the same series. Defaults are
 * the conventional published values, never values fitted to the featured assets.
 */
export const STRATEGY_CATALOG: readonly StrategyMetadata[] = [
  {
    id: "sma-10-30",
    code: "01",
    name: "SMA 10/30 Cross",
    kind: "sma",
    family: "trend",
    horizon: "daily",
    description: "Long while the 10-bar mean sits above the 30-bar mean, short while it sits below.",
    warmup: 30,
    parameters: [p("fast", "Fast SMA", 10, 2, 200), p("slow", "Slow SMA", 30, 3, 400)],
    evidence: trendEvidence,
  },
  {
    id: "sma-20-50",
    code: "02",
    name: "SMA 20/50 Cross",
    kind: "sma",
    family: "trend",
    horizon: "swing",
    description: "Medium-horizon trend filter using conventional one-month and quarter-length means.",
    warmup: 50,
    parameters: [p("fast", "Fast SMA", 20, 2, 200), p("slow", "Slow SMA", 50, 3, 400)],
    evidence: trendEvidence,
  },
  {
    id: "sma-50-200",
    code: "03",
    name: "SMA 50/200 Cross",
    kind: "sma",
    family: "trend",
    horizon: "position",
    description: "The widely followed golden-cross and death-cross long-horizon regime filter.",
    warmup: 200,
    parameters: [p("fast", "Fast SMA", 50, 2, 200), p("slow", "Slow SMA", 200, 3, 400)],
    evidence: trendEvidence,
  },
  {
    id: "donchian-20",
    code: "04",
    name: "Donchian 20 Breakout",
    kind: "donchian",
    family: "breakout",
    horizon: "daily",
    description: "Flip long on a new 20-bar closing high and short on a new 20-bar closing low.",
    warmup: 21,
    parameters: [p("lookback", "Channel lookback", 20, 2, 252)],
    evidence: donchianEvidence,
  },
  {
    id: "donchian-55",
    code: "05",
    name: "Donchian 55 Breakout",
    kind: "donchian",
    family: "breakout",
    horizon: "swing",
    description: "The slower classic channel break, trading fewer and longer-held extensions.",
    warmup: 56,
    parameters: [p("lookback", "Channel lookback", 55, 2, 252)],
    evidence: donchianEvidence,
  },
  {
    id: "momentum-63",
    code: "06",
    name: "3-Month Momentum",
    kind: "momentum",
    family: "momentum",
    horizon: "swing",
    description: "Hold in the direction of the trailing 63-bar return.",
    warmup: 63,
    parameters: [p("lookback", "Return lookback", 63, 2, 504)],
    evidence: timeSeriesEvidence,
  },
  {
    id: "momentum-126",
    code: "07",
    name: "6-Month Momentum",
    kind: "momentum",
    family: "momentum",
    horizon: "position",
    description: "Half-year trailing return as a slower directional signal.",
    warmup: 126,
    parameters: [p("lookback", "Return lookback", 126, 2, 504)],
    evidence: crossSectionEvidence,
  },
  {
    id: "momentum-252",
    code: "08",
    name: "12-Month Momentum",
    kind: "momentum",
    family: "momentum",
    horizon: "long",
    description: "The canonical twelve-month lookback, the slowest trend exposure in the set.",
    warmup: 252,
    parameters: [p("lookback", "Return lookback", 252, 2, 504)],
    evidence: timeSeriesEvidence,
  },
  {
    id: "rsi-14-30-70",
    code: "09",
    name: "RSI 14 Reversion",
    kind: "rsi",
    family: "mean-reversion",
    horizon: "daily",
    description: "Buy below 30 and sell above 70 using Wilder's standard RSI configuration.",
    warmup: 15,
    parameters: [
      p("period", "RSI period", 14, 2, 100),
      p("lower", "Oversold", 30, 1, 49),
      p("upper", "Overbought", 70, 51, 99),
    ],
    evidence: rsiEvidence,
  },
  {
    id: "bollinger-20-2",
    code: "10",
    name: "Bollinger 20/2 Reversion",
    kind: "bollinger",
    family: "mean-reversion",
    horizon: "daily",
    description: "Fade closes beyond a 20-bar envelope set two standard deviations from its mean.",
    warmup: 20,
    parameters: [p("period", "Mean period", 20, 2, 252), p("deviations", "Deviations", 2, 0.5, 5, 0.1)],
    evidence: bollingerEvidence,
  },
  {
    id: "ema-12-26",
    code: "11",
    name: "EMA 12/26 Cross",
    kind: "ema",
    family: "trend",
    horizon: "daily",
    description: "Exponential means react faster than simple ones; long while the 12 leads the 26.",
    warmup: 26,
    parameters: [p("fast", "Fast EMA", 12, 2, 200), p("slow", "Slow EMA", 26, 3, 400)],
    evidence: trendEvidence,
  },
  {
    id: "trend-200",
    code: "12",
    name: "200-Bar Trend Filter",
    kind: "trend-filter",
    family: "trend",
    horizon: "position",
    description: "The single-line regime rule: long above the 200-bar mean, short below it.",
    warmup: 200,
    parameters: [p("period", "Mean period", 200, 5, 400)],
    evidence: trendEvidence,
  },
  {
    id: "macd-12-26-9",
    code: "13",
    name: "MACD 12/26/9",
    kind: "macd",
    family: "trend",
    horizon: "daily",
    description: "Trade the MACD line against its nine-period signal line.",
    warmup: 34,
    parameters: [
      p("fast", "Fast EMA", 12, 2, 100),
      p("slow", "Slow EMA", 26, 3, 200),
      p("signal", "Signal EMA", 9, 2, 100),
    ],
    evidence: macdEvidence,
  },
  {
    id: "adx-14-25",
    code: "14",
    name: "ADX 14 Filtered Trend",
    kind: "adx",
    family: "trend",
    horizon: "daily",
    description: "Follow the dominant directional index, but only while ADX confirms a trend.",
    warmup: 28,
    parameters: [p("period", "ADX period", 14, 2, 100), p("threshold", "ADX threshold", 25, 5, 60)],
    evidence: adxEvidence,
  },
  {
    id: "envelope-20-3",
    code: "15",
    name: "MA Envelope 20/3%",
    kind: "envelope",
    family: "mean-reversion",
    horizon: "daily",
    description: "Fade closes more than three percent away from the 20-bar mean.",
    warmup: 20,
    parameters: [
      p("period", "Mean period", 20, 2, 252),
      p("band", "Band width", 0.03, 0.002, 0.25, 0.001),
    ],
    evidence: bollingerEvidence,
  },
  {
    id: "zscore-20-2",
    code: "16",
    name: "Z-Score 20/2 Reversion",
    kind: "zscore",
    family: "mean-reversion",
    horizon: "daily",
    description: "Fade closes two standard deviations from a 20-bar mean, sized on the raw score.",
    warmup: 20,
    parameters: [
      p("period", "Mean period", 20, 2, 252),
      p("threshold", "Z threshold", 2, 0.5, 5, 0.1),
    ],
    evidence: reversionEvidence,
  },
  {
    id: "stochastic-14",
    code: "17",
    name: "Stochastic 14 Reversal",
    kind: "stochastic",
    family: "mean-reversion",
    horizon: "daily",
    description: "Buy when %K sits below 20 within its 14-bar range and sell above 80.",
    warmup: 14,
    parameters: [
      p("period", "%K period", 14, 2, 100),
      p("lower", "Oversold", 20, 1, 49),
      p("upper", "Overbought", 80, 51, 99),
    ],
    evidence: stochasticEvidence,
  },
  {
    id: "atr-channel-20",
    code: "18",
    name: "ATR Channel 20/2",
    kind: "atr-channel",
    family: "breakout",
    horizon: "swing",
    description: "Break out of a channel measured in average true ranges rather than fixed bars.",
    warmup: 21,
    parameters: [
      p("period", "Channel period", 20, 2, 252),
      p("multiple", "ATR multiple", 2, 0.5, 6, 0.1),
    ],
    evidence: donchianEvidence,
  },
  {
    id: "vol-target-trend",
    code: "19",
    name: "Vol-Filtered Trend 100",
    kind: "vol-trend",
    family: "trend",
    horizon: "position",
    description: "Hold the 100-bar trend only while realized volatility stays under the target.",
    warmup: 100,
    parameters: [
      p("trend", "Trend period", 100, 5, 400),
      p("vol", "Volatility period", 20, 5, 252),
      p("maxVol", "Max per-bar vol", 0.03, 0.002, 0.2, 0.001),
    ],
    evidence: volTargetEvidence,
  },
  {
    id: "dual-momentum",
    code: "20",
    name: "Dual Momentum 126/200",
    kind: "dual-momentum",
    family: "momentum",
    horizon: "long",
    description: "Take a side only when the trailing return and the long trend point the same way.",
    warmup: 200,
    parameters: [
      p("lookback", "Return lookback", 126, 2, 504),
      p("trend", "Trend period", 200, 5, 400),
    ],
    evidence: dualMomentumEvidence,
  },
  {
    id: "faber-10m",
    code: "21",
    name: "Faber 10-Month Timing",
    kind: "trend-filter",
    family: "trend",
    horizon: "long",
    description:
      "The published tactical allocation rule: hold while the close is above its 10-month mean, stand aside below it. Meant for monthly bars.",
    warmup: 10,
    parameters: [p("period", "Mean period", 10, 3, 36)],
    evidence: trendEvidence,
  },
  {
    id: "sma-6-12m",
    code: "22",
    name: "SMA 6/12-Month Cross",
    kind: "sma",
    family: "trend",
    horizon: "long",
    description: "A half-year mean crossing a one-year mean — the slowest crossover in the catalog.",
    warmup: 12,
    parameters: [p("fast", "Fast SMA", 6, 2, 24), p("slow", "Slow SMA", 12, 3, 60)],
    evidence: trendEvidence,
  },
  {
    id: "momentum-12m",
    code: "23",
    name: "12-Month Absolute Momentum",
    kind: "momentum",
    family: "momentum",
    horizon: "long",
    description:
      "Hold in the direction of the trailing twelve-month return, measured on monthly bars rather than daily ones.",
    warmup: 12,
    parameters: [p("lookback", "Return lookback", 12, 2, 60)],
    evidence: timeSeriesEvidence,
  },
  {
    id: "dual-momentum-12m",
    code: "24",
    name: "Dual Momentum 12/10-Month",
    kind: "dual-momentum",
    family: "momentum",
    horizon: "long",
    description:
      "Antonacci's pairing at its published monthly cadence: a side only when the year's return and the 10-month trend agree.",
    warmup: 12,
    parameters: [p("lookback", "Return lookback", 12, 2, 60), p("trend", "Trend period", 10, 3, 36)],
    evidence: dualMomentumEvidence,
  },
  {
    id: "vol-trend-12m",
    code: "25",
    name: "Vol-Filtered Trend 12-Month",
    kind: "vol-trend",
    family: "trend",
    horizon: "long",
    description:
      "The long trend, held only while realized volatility stays under target — exposure scaled down in turbulent regimes.",
    warmup: 12,
    parameters: [
      p("trend", "Trend period", 12, 3, 60),
      p("vol", "Volatility period", 6, 2, 36),
      p("maxVol", "Max per-bar vol", 0.08, 0.005, 0.4, 0.005),
    ],
    evidence: volTargetEvidence,
  },
  {
    id: "donchian-52w",
    code: "26",
    name: "52-Week High Breakout",
    kind: "donchian",
    family: "breakout",
    horizon: "position",
    description:
      "Flip long on a new one-year closing high. Nearness to the 52-week high is itself the documented predictor.",
    warmup: 53,
    parameters: [p("lookback", "Channel lookback", 52, 4, 260)],
    evidence: fiftyTwoWeekEvidence,
  },
  {
    id: "trend-30w",
    code: "27",
    name: "30-Week Stage Filter",
    kind: "trend-filter",
    family: "trend",
    horizon: "position",
    description:
      "Weinstein's regime line: above the 30-week mean is accumulation and advance, below it is distribution and decline.",
    warmup: 30,
    parameters: [p("period", "Mean period", 30, 5, 120)],
    evidence: stageEvidence,
  },
  {
    id: "momentum-26w",
    code: "28",
    name: "26-Week Momentum",
    kind: "momentum",
    family: "momentum",
    horizon: "position",
    description: "The six-month lookback at weekly cadence, where the original cross-sectional work measured it.",
    warmup: 26,
    parameters: [p("lookback", "Return lookback", 26, 2, 120)],
    evidence: crossSectionEvidence,
  },
  {
    id: "donchian-13w",
    code: "29",
    name: "Quarterly Channel Breakout",
    kind: "donchian",
    family: "breakout",
    horizon: "position",
    description: "A thirteen-week channel — one quarter of range — traded on weekly closes.",
    warmup: 14,
    parameters: [p("lookback", "Channel lookback", 13, 3, 104)],
    evidence: donchianEvidence,
  },
  {
    id: "macd-weekly",
    code: "30",
    name: "Weekly MACD 12/26/9",
    kind: "macd",
    family: "trend",
    horizon: "swing",
    description:
      "The conventional MACD settings read on weekly bars, which is how they were originally charted.",
    warmup: 34,
    parameters: [
      p("fast", "Fast EMA", 12, 2, 100),
      p("slow", "Slow EMA", 26, 3, 200),
      p("signal", "Signal EMA", 9, 2, 100),
    ],
    evidence: macdEvidence,
  },
] as const;

export const STRATEGY_BY_ID = new Map(STRATEGY_CATALOG.map((strategy) => [strategy.id, strategy]));

export function getStrategy(id: string): StrategyMetadata | undefined {
  return STRATEGY_BY_ID.get(id);
}

/** Default parameter values keyed by parameter name. */
export function defaultParameters(strategy: StrategyMetadata): Record<string, number> {
  return Object.fromEntries(strategy.parameters.map((parameter) => [parameter.key, parameter.value]));
}
