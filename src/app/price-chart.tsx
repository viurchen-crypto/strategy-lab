"use client";

import { useEffect, useRef, useState } from "react";
import type { BarTuple, StrategyRun } from "@/lib/engine";
import { isIntraday } from "@/lib/format";

interface PriceChartProps {
  bars: BarTuple[];
  strategy: StrategyRun;
  /** Extra equity curves overlaid for comparison; the focused one keeps its markers. */
  compared?: readonly StrategyRun[];
  benchmarkEquity: number[];
  timeframe: string;
  showBenchmark: boolean;
  /** Last bar the viewer has "played" to; everything after it is hidden. */
  cursor: number;
  /** Bar index where out-of-sample begins, or -1 when the split is off. */
  splitIndex: number;
}

interface ChartPalette {
  up: string;
  down: string;
  equity: string;
  benchmark: string;
  split: string;
  grid: string;
  text: string;
  border: string;
}

/** The dark values, used on the server and as the floor if a token is missing. */
const FALLBACK: ChartPalette = {
  up: "#3fdf9c",
  down: "#ff5f70",
  equity: "#35d6f5",
  benchmark: "#62717c",
  split: "#f6c96b",
  grid: "#121b21",
  text: "#7d8f9a",
  border: "#1e2b34",
};

/**
 * The chart is a canvas, so it cannot inherit CSS. It reads the same
 * `--chart-*` tokens the stylesheet defines instead, which is what makes the
 * light theme a token swap rather than a second chart configuration.
 */
function readPalette(): ChartPalette {
  if (typeof window === "undefined") return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    style.getPropertyValue(`--chart-${name}`).trim() || fallback;

  return {
    up: token("up", FALLBACK.up),
    down: token("down", FALLBACK.down),
    equity: token("equity", FALLBACK.equity),
    benchmark: token("bench", FALLBACK.benchmark),
    split: token("split", FALLBACK.split),
    grid: token("grid", FALLBACK.grid),
    text: token("text", FALLBACK.text),
    border: token("border", FALLBACK.border),
  };
}

const SERIES_FALLBACK = ["#f6c96b", "#c084fc", "#fb923c", "#4ade80", "#f472b6"];

/** The comparison colours, read from the same tokens the legend swatches use. */
function useSeriesColors(): string[] {
  const [colors, setColors] = useState<string[]>(SERIES_FALLBACK);

  useEffect(() => {
    const sync = () => {
      const style = getComputedStyle(document.documentElement);
      setColors(
        SERIES_FALLBACK.map(
          (fallback, index) => style.getPropertyValue(`--series-${index + 1}`).trim() || fallback,
        ),
      );
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

/**
 * Republishes the palette whenever the theme attribute on the root changes,
 * so flipping to light mode rebuilds the chart instead of leaving dark candles
 * on a white panel.
 */
function useChartPalette(): ChartPalette {
  const [palette, setPalette] = useState<ChartPalette>(FALLBACK);

  useEffect(() => {
    const sync = () => setPalette(readPalette());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return palette;
}

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
  compared = [],
  benchmarkEquity,
  timeframe,
  showBenchmark,
  cursor,
  splitIndex,
}: PriceChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const applyCursor = useRef<((index: number) => void) | null>(null);
  const palette = useChartPalette();
  const seriesColors = useSeriesColors();

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
          textColor: palette.text,
          fontSize: 10,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          panes: { separatorColor: palette.border, separatorHoverColor: palette.equity },
        },
        grid: {
          vertLines: { color: palette.grid },
          horzLines: { color: palette.grid },
        },
        rightPriceScale: { borderColor: palette.border },
        timeScale: {
          borderColor: palette.border,
          timeVisible: isIntraday(timeframe),
          secondsVisible: false,
        },
        crosshair: {
          vertLine: { color: palette.border, labelBackgroundColor: palette.equity },
          horzLine: { color: palette.border, labelBackgroundColor: palette.equity },
        },
        autoSize: true,
      });

      const price = chart.addSeries(CandlestickSeries, {
        upColor: palette.up,
        downColor: palette.down,
        borderUpColor: palette.up,
        borderDownColor: palette.down,
        wickUpColor: palette.up,
        wickDownColor: palette.down,
        priceLineVisible: false,
      });

      const equity = chart.addSeries(
        LineSeries,
        { color: palette.equity, lineWidth: 2, priceLineVisible: false, lastValueVisible: true },
        1,
      );

      const benchmark = showBenchmark
        ? chart.addSeries(
            LineSeries,
            {
              color: palette.benchmark,
              lineWidth: 1,
              lineStyle: 2,
              priceLineVisible: false,
              lastValueVisible: false,
            },
            1,
          )
        : undefined;

      // One line per compared strategy, in the same order the legend lists them.
      const overlays = compared.map((entry, index) =>
        chart.addSeries(
          LineSeries,
          {
            color: seriesColors[index % seriesColors.length],
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            title: entry.code,
          },
          1,
        ),
      );

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
        overlays.forEach((series, index) => {
          series.setData(
            compared[index].equity.slice(0, end).map((value, position) => ({
              time: bars[position][0] as never,
              value,
            })),
          );
        });

        const lastTime = visible.at(-1)?.[0] ?? 0;
        markers.setMarkers([
          ...strategy.trades
            .filter((trade) => trade.entryTime <= lastTime)
            .flatMap((trade) => [
              {
                time: trade.entryTime as never,
                position: (trade.side === "long" ? "belowBar" : "aboveBar") as never,
                color: trade.side === "long" ? palette.up : palette.down,
                shape: (trade.side === "long" ? "arrowUp" : "arrowDown") as never,
              },
              ...(trade.exitTime <= lastTime
                ? [
                    {
                      time: trade.exitTime as never,
                      position: "inBar" as never,
                      color: trade.exitReason === "stop" ? palette.down : palette.text,
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
                  color: palette.split,
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
  }, [bars, strategy, benchmarkEquity, timeframe, showBenchmark, splitIndex, palette, compared, seriesColors]);

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
