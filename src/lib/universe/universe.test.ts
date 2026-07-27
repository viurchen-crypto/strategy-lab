import { describe, expect, it } from "vitest";
import { CRYPTO, lookupSymbol, searchUniverse, SP500, SP500_SECTORS, UNIVERSE } from ".";

describe("universe", () => {
  it("carries the whole index with unique symbols", () => {
    expect(SP500.length).toBeGreaterThan(490);
    expect(new Set(SP500.map(({ symbol }) => symbol)).size).toBe(SP500.length);
    expect(new Set(UNIVERSE.map(({ symbol }) => symbol)).size).toBe(UNIVERSE.length);
  });

  it("uses the provider's symbol spelling for class shares", () => {
    // The index writes BRK.B; the price provider serves it as BRK-B.
    expect(SP500.some(({ symbol }) => symbol.includes("."))).toBe(false);
    expect(lookupSymbol("BRK-B")?.name).toMatch(/Berkshire/i);
  });

  it("files every constituent under one of the eleven GICS sectors", () => {
    for (const entry of SP500) {
      expect(SP500_SECTORS).toContain(entry.sector);
    }
    expect(SP500_SECTORS).toHaveLength(11);
  });

  it("includes the top five cryptocurrencies on provider symbols", () => {
    expect(CRYPTO.map(({ symbol }) => symbol)).toEqual([
      "BTC-USD",
      "ETH-USD",
      "XRP-USD",
      "SOL-USD",
      "BNB-USD",
    ]);
  });

  it("ranks an exact symbol above a company whose name merely contains it", () => {
    const results = searchUniverse("BA");
    expect(results[0].symbol).toBe("BA");
  });

  it("finds instruments by company name", () => {
    expect(searchUniverse("bitcoin")[0].symbol).toBe("BTC-USD");
    expect(searchUniverse("nvidia")[0].symbol).toBe("NVDA");
  });

  it("returns nothing for an empty query rather than the whole index", () => {
    expect(searchUniverse("   ")).toEqual([]);
  });

  it("keeps the benchmarks searchable alongside the constituents", () => {
    expect(lookupSymbol("SPY")).toBeDefined();
    expect(lookupSymbol("^GSPC")).toBeDefined();
  });
});
