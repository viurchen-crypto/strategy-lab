import { describe, expect, it } from "vitest";

import {
  bollingerSignals,
  breakoutSignals,
  momentumSignals,
  rsiSignals,
  smaCrossoverSignals,
  zScoreSignals,
} from "./signals";

const N = null;

describe("smaCrossoverSignals", () => {
  it("returns positions only after both rolling means are available", () => {
    expect(smaCrossoverSignals([1, 2, 3, 2, 1], 2, 3)).toEqual([N, N, 1, 1, -1]);
  });
});

describe("breakoutSignals", () => {
  it("compares each close with the prior channel and carries the position inside it", () => {
    expect(breakoutSignals([10, 11, 12, 11, 9, 10], 2)).toEqual([N, N, 1, 1, -1, -1]);
  });
});

describe("momentumSignals", () => {
  it("uses the sign of the lookback return and reports ties as flat", () => {
    expect(momentumSignals([10, 11, 10, 9, 10], 2)).toEqual([N, N, 0, -1, 0]);
  });
});

describe("rsiSignals", () => {
  it("uses Wilder smoothing and maps oversold/overbought readings contrarianly", () => {
    expect(rsiSignals([1, 2, 3, 2, 1, 2], 2, 40, 60)).toEqual([N, N, -1, 0, 1, -1]);
  });

  it("handles all-gain and all-loss windows without division errors", () => {
    expect(rsiSignals([1, 2, 3, 4], 2, 30, 70)).toEqual([N, N, -1, -1]);
    expect(rsiSignals([4, 3, 2, 1], 2, 30, 70)).toEqual([N, N, 1, 1]);
  });
});

describe("bollingerSignals", () => {
  it("fades prices outside bands based on the current population deviation", () => {
    expect(bollingerSignals([10, 10, 10, 14, 10, 6], 3, 1)).toEqual([N, N, 0, -1, 0, 1]);
  });
});

describe("zScoreSignals", () => {
  it("fades threshold deviations and remains flat when variance is zero", () => {
    expect(zScoreSignals([10, 10, 10, 14, 10, 6], 3, 1)).toEqual([N, N, 0, -1, 0, 1]);
  });
});

describe("signal helper validation and purity", () => {
  it("rejects invalid prices and parameters", () => {
    expect(() => momentumSignals([1, Number.NaN], 1)).toThrow(/finite/);
    expect(() => smaCrossoverSignals([1, 2], 2, 2)).toThrow(/fast.*slow/i);
    expect(() => breakoutSignals([1, 2], 0)).toThrow(/positive integer/);
    expect(() => rsiSignals([1, 2], 1, 70, 30)).toThrow(/lower.*upper/i);
  });

  it("does not mutate its input", () => {
    const prices = Object.freeze([10, 11, 12, 9]);
    momentumSignals(prices, 2);
    expect(prices).toEqual([10, 11, 12, 9]);
  });
});
