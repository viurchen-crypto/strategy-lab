export interface GlossaryEntry {
  readonly term: string;
  readonly group: "Performance" | "Risk" | "Trading" | "Method" | "Indicator";
  /** One sentence a newcomer can act on, not a textbook definition. */
  readonly short: string;
  /** The part that matters once the definition has landed. */
  readonly detail: string;
  /** Where in this app the number actually appears. */
  readonly seenIn?: string;
}

/**
 * The vocabulary this app assumes.
 *
 * Every entry answers "what would make me misread this number?", because that
 * is the thing a definition alone leaves out — a win rate of 70% sounds good
 * until you know it can still lose money.
 */
export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: "Total return",
    group: "Performance",
    short: "The change in account equity across the whole tested window, after costs.",
    detail:
      "It says nothing about the path. Two rules with the same total return can differ by whether you would have sat through a 15% drawdown or a 60% one to get it.",
    seenIn: "The headline figure on the performance panel.",
  },
  {
    term: "CAGR",
    group: "Performance",
    short: "Compound annual growth rate — total return restated as a per-year rate.",
    detail:
      "Useful for comparing windows of different lengths. Over a short window it is unstable: a few months of good luck annualises into a number that looks like a career.",
  },
  {
    term: "Sharpe ratio",
    group: "Risk",
    short: "Return per unit of volatility. Roughly: how much you were paid for the bumpiness.",
    detail:
      "Above 1 is good, above 2 on a backtest is usually a sign of overfitting rather than genius. It treats upside and downside swings identically, which punishes rules that mostly surprise you pleasantly.",
    seenIn: "Every leaderboard row, and both halves of the split.",
  },
  {
    term: "Sortino ratio",
    group: "Risk",
    short: "Like Sharpe, but only downside moves count against you.",
    detail:
      "A rule with violent upside and calm downside scores far better here than on Sharpe. When Sortino is much higher than Sharpe, the volatility being punished is the kind you wanted.",
  },
  {
    term: "Maximum drawdown",
    group: "Risk",
    short: "The deepest peak-to-trough fall in equity over the window.",
    detail:
      "This is the number that decides whether a strategy is actually holdable. A 60% drawdown is not a statistic — it is the year you would have abandoned the rule at the bottom.",
  },
  {
    term: "Calmar ratio",
    group: "Risk",
    short: "Annual return divided by the worst drawdown — reward per unit of pain.",
    detail:
      "It answers the question Sharpe dodges: was the suffering worth it? A rule with a Calmar below 0.5 asks you to endure more than it pays.",
  },
  {
    term: "Volatility",
    group: "Risk",
    short: "How much returns scatter around their average, annualised.",
    detail:
      "It is a measure of variability, not of danger. A steadily falling asset can have low volatility the whole way down.",
  },
  {
    term: "Win rate",
    group: "Trading",
    short: "The share of trades that closed in profit.",
    detail:
      "On its own it is nearly meaningless. A rule can win 70% of the time and still lose money if the 30% of losses are each three times larger than a win. Always read it beside profit factor.",
  },
  {
    term: "Profit factor",
    group: "Trading",
    short: "Gross profit divided by gross loss. Below 1 the rule loses money.",
    detail:
      "This is win rate's missing half: it accounts for how big the wins and losses were, not just how many there were of each.",
  },
  {
    term: "Expectancy",
    group: "Trading",
    short: "The average profit or loss per trade, in money.",
    detail:
      "Multiply it by how often the rule trades to see what it is actually worth. High expectancy on four trades a decade is not a business.",
  },
  {
    term: "Exposure",
    group: "Trading",
    short: "The share of bars where a position was open.",
    detail:
      "Low exposure with a high return means most of the money came from a few moments. That is a rule that got lucky more often than it is a rule that works.",
  },
  {
    term: "Slippage",
    group: "Method",
    short: "The gap between the price a signal assumed and the price actually filled.",
    detail:
      "Modelled here in basis points on both sides of every fill. Strategies that trade often are far more sensitive to it — the same rule can be profitable at 1bp and worthless at 10.",
    seenIn: "The execution settings, and every backtest that has ever flattered itself.",
  },
  {
    term: "Look-ahead bias",
    group: "Method",
    short: "Using information a decision could not have had at the time it was made.",
    detail:
      "The classic form is acting on a bar's close at that same close. This engine reads signals at the close and fills at the next open, so no decision uses a price it could not have seen.",
  },
  {
    term: "Overfitting",
    group: "Method",
    short: "Tuning a rule until it explains the past rather than the market.",
    detail:
      "The tell is a strategy that shines in-sample and collapses out-of-sample. Published default parameters exist partly to resist this — which is why this catalog ships them unfitted.",
  },
  {
    term: "In-sample and out-of-sample",
    group: "Method",
    short: "The window the parameters saw, and the window they did not.",
    detail:
      "Only the second half is evidence. If Sharpe falls from 1.8 to 0.2 across the split, what you measured was the fit, not the edge.",
    seenIn: "The split table under the metrics, and the OOS marker on the chart.",
  },
  {
    term: "Buy and hold",
    group: "Method",
    short: "The benchmark: buy at the first bar, sell at the last, pay the same costs.",
    detail:
      "The only honest question a strategy has to answer. A rule that returns 40% where holding returned 90% did not work, however good 40% sounds alone.",
  },
  {
    term: "Warm-up",
    group: "Method",
    short: "The bars an indicator needs before it can say anything.",
    detail:
      "A 200-day mean has no opinion on day 90. Runs shorter than the slowest rule's warm-up are flagged, because those strategies were not given a fair chance.",
  },
  {
    term: "Moving average",
    group: "Indicator",
    short: "The mean price over the last N bars, recomputed each bar.",
    detail:
      "Simple means weight every bar equally; exponential means weight recent bars more, so they turn sooner and whipsaw more. Crossovers of a fast and slow mean are the oldest trend rule there is.",
  },
  {
    term: "RSI",
    group: "Indicator",
    short: "Relative strength index: how one-sided recent moves have been, on a 0–100 scale.",
    detail:
      "Below 30 is conventionally 'oversold' and above 70 'overbought', but in a strong trend RSI can sit above 70 for months. It is a description, not an instruction.",
  },
  {
    term: "ATR",
    group: "Indicator",
    short: "Average true range: how far the price typically travels in a bar.",
    detail:
      "Because it is measured in price rather than percent, it is what stops and channels are usually sized with — a 2×ATR stop adapts to the instrument instead of guessing.",
  },
  {
    term: "MACD",
    group: "Indicator",
    short: "The gap between a fast and a slow exponential mean, read against its own average.",
    detail:
      "It is a crossover rule wearing an oscillator's clothes. The conventional 12/26/9 settings come from charting on paper and have no theoretical claim to being optimal.",
  },
  {
    term: "Donchian channel",
    group: "Indicator",
    short: "The highest high and lowest low of the last N bars.",
    detail:
      "Breaking the upper channel is the canonical trend-following entry. It buys strength by construction, which is why it hurts in ranging markets and pays in trending ones.",
  },
  {
    term: "Bollinger bands",
    group: "Indicator",
    short: "A moving average with bands set a number of standard deviations away.",
    detail:
      "The bands widen with volatility, so 'far from the mean' adapts to conditions. Fading them is a mean-reversion bet; riding them is a trend bet. The same chart supports both stories.",
  },
  {
    term: "52-week range position",
    group: "Indicator",
    short: "Where the price sits between its one-year low and high.",
    detail:
      "Nearness to the 52-week high is itself a documented momentum predictor — better, in some studies, than past return.",
    seenIn: "The 52W column on the screener.",
  },
  {
    term: "Golden cross",
    group: "Indicator",
    short: "The 50-day mean rising above the 200-day mean. The reverse is a death cross.",
    detail:
      "Widely watched, which is part of why it sometimes matters. As a standalone rule it is slow and gives back a lot at turns — the catalog measures exactly how much.",
    seenIn: "The CROSS column on the screener, and strategy 03.",
  },
];

export const GLOSSARY_GROUPS = [
  "Performance",
  "Risk",
  "Trading",
  "Method",
  "Indicator",
] as const;
