"use client";

import { useEffect, useRef } from "react";
import type { BarTuple, StrategyRun } from "@/lib/engine";
import { isIntraday } from "@/lib/format";

interface PriceChartProps {
  bars: BarTuple[];
  strategy: StrategyRun;
  benchmarkEquity: number[];
  timeframe: string;
  showBenchmark: boolean;
  /** Last bar the viewer has "played" to; everything after it is hidden. */
  cursor: number;
  /** Bar index where out-of-sample begins, or -1 when the split is off. */
  splitIndex: number;
}

const COLORS = {
  up: "#43e6a0",
  down: "#ff5f70",
  equity: "#19d3f3",
  benchmark: "#5b6b76",
  split: "#f5c66d",
  grid: "#141e24",
  text: "#71818a",
  border: "#233039",
};

/**
 * Two stacked panes: executed price with trade markers on top, account equity
 * against buy-and-hold below. The library is loaded inside the effect so it is
 * never pulled into the server render.
 *
 * The chart is built once per result. Playback then only re-slices the series
 * from a second effect, so scrubbing never tears the whole chart down.
 */
export function PriceChart({
  bars,
  strategy,
  benchmarkEquity,
  timeframe,
  showBenchmark,
  cursor,
  splitIndex,
}: PriceChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const applyCursor = useRef<((index: number) => void) | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element || bars.length === 0) return;

    let disposed = false;
    let dispose = () => {};

    void (async () => {
      const { createChart, createSeriesMarkers, CandlestickSeries, LineSeries } = await import(
        "lightweight-charts"
      );
      if (disposed || !container.current) return;

      const chart = createChart(element, {
        layout: {
          background: { color: "transparent" },
          textColor: COLORS.text,
          fontSize: 10,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          panes: { separatorColor: COLORS.border, separatorHoverColor: COLORS.equity },
        },
        grid: {
          vertLines: { color: COLORS.grid },
          horzLines: { color: COLORS.grid },
        },
        rightPriceScale: { borderColor: COLORS.border },
        timeScale: {
          borderColor: COLORS.border,
          timeVisible: isIntraday(timeframe),
          secondsVisible: false,
        },
        crosshair: {
          vertLine: { color: COLORS.border, labelBackgroundColor: COLORS.equity },
          horzLine: { color: COLORS.border, labelBackgroundColor: COLORS.equity },
        },
        autoSize: true,
      });

      const price = chart.addSeries(CandlestickSeries, {
        upColor: COLORS.up,
        downColor: COLORS.down,
        borderUpColor: COLORS.up,
        borderDownColor: COLORS.down,
        wickUpColor: COLORS.up,
        wickDownColor: COLORS.down,
        priceLineVisible: false,
      });

      const equity = chart.addSeries(
        LineSeries,
        { color: COLORS.equity, lineWidth: 2, priceLineVisible: false, lastValueVisible: true },
        1,
      );

      const benchmark = showBenchmark
        ? chart.addSeries(
            LineSeries,
            {
              color: COLORS.benchmark,
              lineWidth: 1,
              lineStyle: 2,
              priceLineVisible: false,
              lastValueVisible: false,
            },
            1,
          )
        : undefined;

      const markers = createSeriesMarkers(price, []);

      // The out-of-sample boundary is drawn as a vertical band of one marker so
      // it is obvious which half of the curve the strategy never saw.
      const splitTime = splitIndex >= 0 && splitIndex < bars.length ? bars[splitIndex][0] : undefined;

      const render = (index: number) => {
        const end = Math.max(1, Math.min(bars.length, index + 1));
        const visible = bars.slice(0, end);
        price.setData(
          visible.map(([time, open, high, low, close]) => ({
            time: time as never,
            open,
            high,
            low,
            close,
          })),
        );
        equity.setData(
          strategy.equity.slice(0, end).map((value, position) => ({
            time: bars[position][0] as never,
            value,
          })),
        );
        benchmark?.setData(
          benchmarkEquity.slice(0, end).map((value, position) => ({
            time: bars[position][0] as never,
            value,
          })),
        );

        const lastTime = visible.at(-1)?.[0] ?? 0;
        markers.setMarkers([
          ...strategy.trades
            .filter((trade) => trade.entryTime <= lastTime)
            .flatMap((trade) => [
              {
                time: trade.entryTime as never,
                position: (trade.side === "long" ? "belowBar" : "aboveBar") as never,
                color: trade.side === "long" ? COLORS.up : COLORS.down,
                shape: (trade.side === "long" ? "arrowUp" : "arrowDown") as never,
              },
              ...(trade.exitTime <= lastTime
                ? [
                    {
                      time: trade.exitTime as never,
                      position: "inBar" as never,
                      color: trade.exitReason === "stop" ? COLORS.down : COLORS.text,
                      shape: "circle" as never,
                    },
                  ]
                : []),
            ]),
          ...(splitTime !== undefined && splitTime <= lastTime
            ? [
                {
                  time: splitTime as never,
                  position: "aboveBar" as never,
                  color: COLORS.split,
                  shape: "square" as never,
                  text: "OOS",
                },
              ]
            : []),
        ]);
      };

      render(cursor);
      applyCursor.current = render;
      chart.panes()[0]?.setHeight(Math.max(160, Math.round(element.clientHeight * 0.6)));
      chart.timeScale().fitContent();

      dispose = () => {
        applyCursor.current = null;
        chart.remove();
      };
    })();

    return () => {
      disposed = true;
      dispose();
    };
    // `cursor` is deliberately absent: scrubbing is handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, strategy, benchmarkEquity, timeframe, showBenchmark, splitIndex]);

  useEffect(() => {
    applyCursor.current?.(cursor);
  }, [cursor]);

  return (
    <div
      className="chart-canvas"
      ref={container}
      role="img"
      aria-label={`${strategy.name} price and equity chart`}
    />
  );
}
