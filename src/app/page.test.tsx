import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "./page";

afterEach(cleanup);

describe("strategy dashboard", () => {
  it("renders the core terminal dashboard panels", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /strategy lab/i })).toBeTruthy();
    expect(screen.getByText(/STRATEGIES/)).toBeTruthy();
    expect(screen.getByText(/MARKET PLAYBACK/)).toBeTruthy();
    expect(screen.getByText(/LEADERBOARD/)).toBeTruthy();
    expect(screen.getByText(/HERMES TERMINAL/)).toBeTruthy();
  });

  it("offers every required timeframe", () => {
    render(<Home />);
    for (const timeframe of ["5m", "15m", "1h", "4h", "1D", "1W", "1M"]) {
      expect(screen.getByRole("button", { name: timeframe })).toBeTruthy();
    }
  });
});
