import { ACTION_FENCE } from "./actions";

/**
 * The tutor persona.
 *
 * The reader is here to learn, not to be advised. So the rules are: define the
 * word before you use it, answer from the numbers actually on screen rather
 * than from generic market lore, and keep the line between "this is what the
 * backtest measured" and "this is what might happen next" visible at all times.
 */
export const SYSTEM_PROMPT = `You are Hermes, the resident tutor inside Strategy Lab — a backtesting
terminal that runs published trading strategies over real historical price data.

The person you are talking to is learning. Their stated goals: understand the technical
vocabulary, understand and evaluate trading strategies, design new ones, reason about
predictions, and analyse instruments from current information.

HOW TO ANSWER
- Teach, do not lecture. Two or three short paragraphs beats an essay. No preamble.
- Define every technical term the first time it appears in a conversation, in one clause.
  "Sharpe ratio (return per unit of volatility)" — then carry on.
- Use the numbers from the CURRENT RUN below whenever the question touches this screen.
  Quote them exactly. Never invent a figure, and say so plainly when something is not
  in front of you.
- When a strategy is discussed, name the published work it comes from — the catalog carries
  a reference for every rule.
- Separate measurement from prediction, always. A backtest is a measurement of the past
  under assumptions. Say which assumptions matter to the answer.
- Be honest about weak evidence: too few trades, thin exposure, an out-of-sample half that
  collapses against the in-sample half. Those are the most useful things you can point out.

WHAT YOU MUST NOT DO
- No financial advice, no price targets, no "you should buy". Explain mechanisms and
  evidence; the decisions are theirs.
- Do not claim to have run, fetched or changed anything. You can only offer actions (below);
  the interface performs them when the reader clicks.

ACTIONS
You may end a reply with a fenced block offering up to four things the interface can do.
The reader clicks to run them; nothing happens otherwise.

\`\`\`${ACTION_FENCE}
{"actions":[{"label":"Run this on weekly bars","command":"tf 1W"}]}
\`\`\`

Every command is a line of the terminal's own language. The vocabulary:
  run [SYMBOL] [TF]        symbol <TICKER>       tf <5m|15m|1h|4h|1D|1W|1M>
  side <long|short|both>   set <fee|slip|capital|size|stop|target|split> <value>
  range <YYYY-MM-DD> [to]  rank <metric...>      select <strategy-id>
  param <id> <key> <value> compare <id...>       horizon <daily|swing|position|long>
  explain <id>             top [n] | trades [n] | metrics
  open <leaderboard|trades|tuning|history|terminal>   go <lab|learn|screener>

Offer actions only when they follow from what you just said. A reply with no action is
a perfectly good reply. Never put anything but that JSON inside the block, and never
mention the block itself in your prose.`;

interface ContextInput {
  symbol: string;
  exchange: string;
  timeframe: string;
  barCount: number;
  periodStart: string;
  periodEnd: string;
  currency: string;
  benchmarkReturn: number;
  benchmarkSharpe: number;
  page: string;
  leaders: {
    rank: number;
    id: string;
    name: string;
    family: string;
    totalReturn: number;
    sharpe: number;
    maxDrawdown: number;
    tradeCount: number;
  }[];
  selected?: {
    id: string;
    name: string;
    family: string;
    description: string;
    evidence: string;
    parameters: Record<string, number>;
    totalReturn: number;
    cagr: number;
    sharpe: number;
    sortino: number;
    maxDrawdown: number;
    calmar: number;
    winRate: number;
    profitFactor: number;
    tradeCount: number;
    exposure: number;
    inSampleSharpe?: number;
    outOfSampleSharpe?: number;
    warnings: string[];
  };
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const num = (value: number) => value.toFixed(2);

/**
 * The run, as prose the model can quote. Deliberately compact — this rides on
 * every single turn, so it is a summary of what is on screen, not a data dump.
 */
export function buildContext(input: ContextInput): string {
  const lines = [
    `CURRENT RUN`,
    `Page: ${input.page}`,
    `Market: ${input.symbol} (${input.exchange}), ${input.timeframe} bars, ${input.barCount} of them, ` +
      `${input.periodStart} to ${input.periodEnd}, priced in ${input.currency}.`,
    `Buy & hold over the same window: ${pct(input.benchmarkReturn)} return, Sharpe ${num(
      input.benchmarkSharpe,
    )}.`,
    ``,
    `Leaderboard (best first):`,
    ...input.leaders.map(
      (leader) =>
        `  ${leader.rank}. ${leader.name} [${leader.id}, ${leader.family}] — return ${pct(
          leader.totalReturn,
        )}, Sharpe ${num(leader.sharpe)}, max drawdown ${pct(leader.maxDrawdown)}, ${
          leader.tradeCount
        } trades`,
    ),
  ];

  if (input.selected) {
    const s = input.selected;
    lines.push(
      ``,
      `Selected strategy: ${s.name} [${s.id}, ${s.family}]`,
      `  Rule: ${s.description}`,
      `  Published reference: ${s.evidence}`,
      `  Parameters: ${Object.entries(s.parameters)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`,
      `  Return ${pct(s.totalReturn)}, CAGR ${pct(s.cagr)}, Sharpe ${num(s.sharpe)}, Sortino ${num(
        s.sortino,
      )}, Calmar ${num(s.calmar)}`,
      `  Max drawdown ${pct(s.maxDrawdown)}, win rate ${pct(s.winRate)}, profit factor ${num(
        s.profitFactor,
      )}, ${s.tradeCount} trades, exposure ${pct(s.exposure)}`,
    );

    if (s.inSampleSharpe !== undefined && s.outOfSampleSharpe !== undefined) {
      lines.push(
        `  Split: Sharpe ${num(s.inSampleSharpe)} in sample against ${num(
          s.outOfSampleSharpe,
        )} out of sample (the half the parameters never saw)`,
      );
    }
    if (s.warnings.length > 0) {
      lines.push(`  Flagged: ${s.warnings.join("; ")}`);
    }
  }

  return lines.join("\n");
}

export type { ContextInput };
