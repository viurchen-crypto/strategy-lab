import { INSTRUMENTS } from "../instruments";
import { TIMEFRAMES, type Timeframe } from "../market/timeframes";
import { RANKABLE_METRICS, type RankableMetric } from "../ranking";
import { getStrategy, STRATEGY_CATALOG } from "../strategies/catalog";

export type Direction = "long" | "short" | "both";

/** Everything the terminal is allowed to change, mirroring the command bar. */
export interface TerminalConfig {
  symbol: string;
  timeframe: Timeframe;
  capital: number;
  commissionBps: number;
  slippageBps: number;
  direction: Direction;
  positionSizePct: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  splitFraction: number;
  start?: number;
  end?: number;
}

export type CommandResult =
  | { kind: "output"; lines: string[] }
  | { kind: "error"; lines: string[] }
  | { kind: "config"; config: TerminalConfig; lines: string[]; rerun: boolean }
  | { kind: "ranking"; metrics: RankableMetric[]; lines: string[] }
  | { kind: "select"; strategyId: string; lines: string[] }
  | { kind: "parameter"; strategyId: string; key: string; value: number; lines: string[] }
  | { kind: "query"; query: "top" | "trades" | "metrics"; count?: number; lines: string[] }
  | { kind: "action"; action: "clear" | "export" | "history" | "help"; lines: string[] };

export const COMMANDS = [
  "run",
  "symbol",
  "tf",
  "side",
  "set",
  "range",
  "rank",
  "top",
  "trades",
  "metrics",
  "explain",
  "param",
  "select",
  "history",
  "export",
  "help",
  "clear",
] as const;

const SETTABLE = {
  fee: "commissionBps",
  slip: "slippageBps",
  capital: "capital",
  size: "positionSizePct",
  stop: "stopLossPct",
  target: "takeProfitPct",
  split: "splitFraction",
} as const;

type SettableKey = keyof typeof SETTABLE;

export const HELP_LINES = [
  "run [SYMBOL] [TF]        run the catalog on the current or given market",
  "symbol <TICKER>          change the instrument      e.g. symbol BTC-USD",
  "tf <TIMEFRAME>           5m 15m 1h 4h 1D 1W 1M",
  "side <long|short|both>   allowed directions",
  "set fee|slip <bps>       transaction costs in basis points",
  "set capital <amount>     starting capital",
  "set size <percent>       share of equity per position",
  "set stop|target <pct>    protective exits, 0 to disable",
  "set split <0..0.95>      in-sample share, 0 disables the split",
  "range <from> [to]        YYYY-MM-DD window, 'range all' clears it",
  "rank <metric...>         leaderboard criteria, e.g. rank sharpe calmar",
  "top [n] | trades [n]     print the leaderboard or the trade log",
  "metrics                  print the selected strategy's metrics",
  "explain <id>             describe a strategy and its evidence",
  "select <id>              focus a strategy in the panels",
  "param <id> <key> <val>   override a strategy parameter",
  "history | export | clear | help",
];

const parseDate = (value: string): number | undefined => {
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) ? Math.floor(stamp / 1_000) : undefined;
};

const error = (...lines: string[]): CommandResult => ({ kind: "error", lines });
const output = (...lines: string[]): CommandResult => ({ kind: "output", lines });

const isTimeframe = (value: string): value is Timeframe =>
  (TIMEFRAMES as readonly string[]).includes(value);

const isMetric = (value: string): value is RankableMetric =>
  (RANKABLE_METRICS as readonly string[]).includes(value);

/**
 * Parses one line into an intent. Pure by design: the dashboard owns the state,
 * so the same command can be tested without rendering anything.
 */
export function runCommand(line: string, config: TerminalConfig): CommandResult {
  const [name, ...args] = line.trim().split(/\s+/);
  if (!name) return output();
  const command = name.toLowerCase();
  const next = { ...config };

  switch (command) {
    case "help":
      return { kind: "action", action: "help", lines: HELP_LINES };

    case "clear":
      return { kind: "action", action: "clear", lines: [] };

    case "history":
      return { kind: "action", action: "history", lines: [] };

    case "export":
      return { kind: "action", action: "export", lines: ["Exporting the trade log as CSV…"] };

    case "run": {
      if (args.length > 2) return error("Usage: run [SYMBOL] [TIMEFRAME]");
      const timeframe = args.find(isTimeframe);
      const symbols = args.filter((argument) => !isTimeframe(argument));
      if (symbols.length > 1 || symbols.some((symbol) => !/^[A-Za-z0-9.^=_-]{1,24}$/.test(symbol))) {
        return error("Usage: run [SYMBOL] [TIMEFRAME]");
      }
      if (args.length === 2 && !timeframe) return error(`Unknown timeframe "${args[1]}"`);
      if (timeframe) next.timeframe = timeframe;
      if (symbols[0]) next.symbol = symbols[0].toUpperCase();
      return {
        kind: "config",
        config: next,
        rerun: true,
        lines: [`Running ${next.symbol} · ${next.timeframe} · ${next.direction}…`],
      };
    }

    case "symbol": {
      if (!args[0]) return error("Usage: symbol <TICKER>");
      if (!/^[A-Za-z0-9.^=_-]{1,24}$/.test(args[0])) return error(`Unsupported symbol "${args[0]}"`);
      next.symbol = args[0].toUpperCase();
      return { kind: "config", config: next, rerun: true, lines: [`Symbol set to ${next.symbol}`] };
    }

    case "tf": {
      if (!args[0] || !isTimeframe(args[0])) {
        return error(`Usage: tf <${TIMEFRAMES.join("|")}>`);
      }
      next.timeframe = args[0];
      return { kind: "config", config: next, rerun: true, lines: [`Timeframe set to ${next.timeframe}`] };
    }

    case "side": {
      const side = args[0]?.toLowerCase();
      if (side !== "long" && side !== "short" && side !== "both") {
        return error("Usage: side <long|short|both>");
      }
      next.direction = side;
      return { kind: "config", config: next, rerun: true, lines: [`Direction set to ${side}`] };
    }

    case "set": {
      const key = args[0]?.toLowerCase() as SettableKey | undefined;
      if (!key || !(key in SETTABLE)) {
        return error(`Usage: set <${Object.keys(SETTABLE).join("|")}> <value>`);
      }
      const value = Number(args[1]);
      if (!Number.isFinite(value) || value < 0) return error(`"${args[1] ?? ""}" is not a valid number`);

      switch (key) {
        case "fee":
          next.commissionBps = Math.min(1_000, value);
          break;
        case "slip":
          next.slippageBps = Math.min(1_000, value);
          break;
        case "capital":
          if (value <= 0) return error("Capital must be positive");
          next.capital = value;
          break;
        // Percentages are entered as percentages and stored as fractions.
        case "size":
          if (value <= 0 || value > 100) return error("Size must be within (0, 100]");
          next.positionSizePct = value / 100;
          break;
        case "stop":
          next.stopLossPct = value === 0 ? undefined : Math.min(90, value) / 100;
          break;
        case "target":
          next.takeProfitPct = value === 0 ? undefined : value / 100;
          break;
        case "split":
          if (value > 0.95) return error("Split must be within [0, 0.95]");
          next.splitFraction = value;
          break;
      }
      return { kind: "config", config: next, rerun: true, lines: [`${key} = ${args[1]}`] };
    }

    case "range": {
      if (args[0]?.toLowerCase() === "all" || args.length === 0) {
        next.start = undefined;
        next.end = undefined;
        return { kind: "config", config: next, rerun: true, lines: ["Range cleared: full history"] };
      }
      const start = parseDate(args[0]);
      if (start === undefined) return error("Usage: range <YYYY-MM-DD> [YYYY-MM-DD]");
      const end = args[1] ? parseDate(args[1]) : undefined;
      if (args[1] && end === undefined) return error(`"${args[1]}" is not a date`);
      if (end !== undefined && end <= start) return error("The end date must follow the start date");
      next.start = start;
      next.end = end;
      return {
        kind: "config",
        config: next,
        rerun: true,
        lines: [`Range set to ${args[0]} → ${args[1] ?? "latest"}`],
      };
    }

    case "rank": {
      const metrics = args.map((argument) => argument.toLowerCase());
      const unknown = metrics.filter((metric) => !isMetric(metric));
      if (metrics.length === 0 || unknown.length > 0) {
        return error(
          unknown.length > 0 ? `Unknown metric: ${unknown.join(", ")}` : "Usage: rank <metric...>",
          `Available: ${RANKABLE_METRICS.join(" ")}`,
        );
      }
      return {
        kind: "ranking",
        metrics: metrics.filter(isMetric),
        lines: [`Ranking by ${metrics.join(" + ")}`],
      };
    }

    case "explain": {
      const strategy = args[0] ? getStrategy(args[0]) : undefined;
      if (!strategy) {
        return error(
          args[0] ? `No strategy "${args[0]}"` : "Usage: explain <strategy-id>",
          `Known ids: ${STRATEGY_CATALOG.map(({ id }) => id).join(" ")}`,
        );
      }
      return output(
        `${strategy.code} ${strategy.name}  [${strategy.family}]`,
        strategy.description,
        `Warm-up ${strategy.warmup} bars · ${strategy.parameters
          .map((parameter) => `${parameter.key}=${parameter.value}`)
          .join(" ")}`,
        `Evidence: ${strategy.evidence.title}`,
        strategy.evidence.note,
      );
    }

    case "select": {
      if (!args[0] || !getStrategy(args[0])) return error("Usage: select <strategy-id>");
      return { kind: "select", strategyId: args[0], lines: [`Selected ${args[0]}`] };
    }

    case "param": {
      const strategy = args[0] ? getStrategy(args[0]) : undefined;
      if (!strategy) return error("Usage: param <strategy-id> <key> <value>");
      const parameter = strategy.parameters.find(({ key }) => key === args[1]);
      if (!parameter) {
        return error(
          `"${args[1] ?? ""}" is not a parameter of ${strategy.id}`,
          `Available: ${strategy.parameters.map(({ key }) => key).join(" ")}`,
        );
      }
      const value = Number(args[2]);
      if (!Number.isFinite(value)) return error(`"${args[2] ?? ""}" is not a number`);
      if (value < parameter.min || value > parameter.max) {
        return error(`${parameter.label} must be between ${parameter.min} and ${parameter.max}`);
      }
      return {
        kind: "parameter",
        strategyId: strategy.id,
        key: parameter.key,
        value,
        lines: [`${strategy.id}.${parameter.key} = ${value}`],
      };
    }

    // Read-only printers: the dashboard holds the results, so it renders these.
    case "top":
    case "trades":
    case "metrics": {
      const count = Number(args[0]);
      return {
        kind: "query",
        query: command,
        count: Number.isFinite(count) && count > 0 ? Math.min(100, Math.floor(count)) : undefined,
        lines: [],
      };
    }

    default:
      return error(`Unknown command "${command}" — type help`);
  }
}

/** Tab completion over commands, then the argument vocabulary of the command being typed. */
export function complete(line: string): string[] {
  const parts = line.split(/\s+/);
  const partial = parts.at(-1) ?? "";
  const starts = (candidates: readonly string[]) =>
    candidates.filter((candidate) => candidate.toLowerCase().startsWith(partial.toLowerCase()));

  if (parts.length <= 1) return starts(COMMANDS);

  switch (parts[0].toLowerCase()) {
    case "run":
    case "symbol":
      return starts(INSTRUMENTS.map(({ symbol }) => symbol));
    case "tf":
      return starts(TIMEFRAMES);
    case "side":
      return starts(["long", "short", "both"]);
    case "set":
      return parts.length === 2 ? starts(Object.keys(SETTABLE)) : [];
    case "rank":
      return starts(RANKABLE_METRICS);
    case "explain":
    case "select":
    case "param":
      return parts.length <= 2 ? starts(STRATEGY_CATALOG.map(({ id }) => id)) : [];
    default:
      return [];
  }
}
