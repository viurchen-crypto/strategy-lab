import { INSTRUMENTS } from "../instruments";
import { SP500, type UniverseEntry } from "./sp500";

export { SP500, SP500_SECTORS, type Sector, type UniverseEntry } from "./sp500";

/**
 * The five largest cryptocurrencies by market capitalisation, on the symbols the
 * price provider serves them under. Ordering is by size, not alphabetical, so
 * the list reads the way a market list is expected to.
 */
export const CRYPTO: readonly UniverseEntry[] = [
  { symbol: "BTC-USD", name: "Bitcoin", sector: "Crypto" },
  { symbol: "ETH-USD", name: "Ethereum", sector: "Crypto" },
  { symbol: "XRP-USD", name: "XRP", sector: "Crypto" },
  { symbol: "SOL-USD", name: "Solana", sector: "Crypto" },
  { symbol: "BNB-USD", name: "BNB", sector: "Crypto" },
];

/** Indices and ETFs are not S&P constituents but belong in the search. */
const BENCHMARKS: readonly UniverseEntry[] = INSTRUMENTS.filter(
  (instrument) => instrument.group === "ETF" || instrument.group === "INDEX",
).map((instrument) => ({
  symbol: instrument.symbol,
  name: instrument.label,
  sector: instrument.group === "INDEX" ? "Index" : "ETF",
}));

/**
 * Everything the symbol field and the palette can find: 503 constituents, the
 * major benchmarks, and the top cryptocurrencies. Any symbol the provider knows
 * can still be typed in by hand — this is the searchable set, not a whitelist.
 */
export const UNIVERSE: readonly UniverseEntry[] = [...BENCHMARKS, ...SP500, ...CRYPTO];

const BY_SYMBOL = new Map(UNIVERSE.map((entry) => [entry.symbol, entry]));

export const lookupSymbol = (symbol: string): UniverseEntry | undefined =>
  BY_SYMBOL.get(symbol.toUpperCase());

/**
 * Ranked search over symbol and name. An exact symbol match wins, then a symbol
 * prefix, then a name prefix, then anything containing the query — so typing
 * "ba" offers BA before Bath & Body Works before Alibaba.
 */
export function searchUniverse(query: string, limit = 12): UniverseEntry[] {
  const needle = query.trim().toUpperCase();
  if (!needle) return [];

  const scored: { entry: UniverseEntry; score: number }[] = [];

  for (const entry of UNIVERSE) {
    const symbol = entry.symbol.toUpperCase();
    const name = entry.name.toUpperCase();

    const score =
      symbol === needle
        ? 0
        : symbol.startsWith(needle)
          ? 1
          : name.startsWith(needle)
            ? 2
            : symbol.includes(needle)
              ? 3
              : name.includes(needle)
                ? 4
                : -1;

    if (score >= 0) scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.entry.symbol.length - b.entry.symbol.length)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
