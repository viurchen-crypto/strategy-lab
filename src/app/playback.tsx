"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface PlaybackProps {
  /** Number of bars in the run; the cursor addresses `0 … barCount - 1`. */
  barCount: number;
  cursor: number;
  onCursor: (index: number) => void;
  label: string;
  /** Equity of the selected strategy, drawn as a miniature behind the scrubber. */
  equity: readonly number[];
  /** Bar index where out-of-sample begins, or -1 when the split is off. */
  splitIndex: number;
}

const SPEEDS = [1, 2, 5, 20] as const;
/** A 1× replay of any window takes about this long, so long histories stay watchable. */
const FULL_REPLAY_SECONDS = 60;
const MIN_RATE = 6;

/**
 * Reduced motion does not mean "no playback" — the viewer asked for it. It means
 * the playhead jumps a few times a second instead of moving every frame.
 */
const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Scrubs a finished backtest. Nothing here recomputes the run — the cursor only
 * limits how much of an already-computed result the panels are allowed to show.
 */
export function Playback({
  barCount,
  cursor,
  onCursor,
  label,
  equity,
  splitIndex,
}: PlaybackProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const frame = useRef(0);
  const last = useRef(0);
  const position = useRef(cursor);

  // The animation frame reads the cursor from a ref so a moving playhead does
  // not tear down and rebuild the loop on every bar.
  useEffect(() => {
    position.current = cursor;
  }, [cursor]);

  useEffect(() => {
    if (!playing) return;

    const rate = Math.max(MIN_RATE, barCount / FULL_REPLAY_SECONDS);
    const minInterval = prefersReducedMotion() ? 250 : 0;

    last.current = performance.now();
    const step = (now: number) => {
      const elapsed = now - last.current;
      const advanced = (elapsed / 1_000) * rate * speed;
      if (advanced >= 1 && elapsed >= minInterval) {
        last.current = now;
        const next = Math.min(barCount - 1, position.current + Math.floor(advanced));
        // Advance the ref here rather than waiting for the render round trip,
        // otherwise the playhead falls behind whenever a frame renders slowly.
        position.current = next;
        onCursor(next);
        if (next >= barCount - 1) {
          setPlaying(false);
          return;
        }
      }
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, speed, barCount, onCursor]);

  const atEnd = cursor >= barCount - 1;
  const nudge = (delta: number) =>
    onCursor(Math.max(0, Math.min(barCount - 1, cursor + delta)));

  const jump = (index: number) => {
    setPlaying(false);
    position.current = index;
    onCursor(index);
  };

  return (
    <div className="playback" role="group" aria-label="Market playback">
      <div className="playback-transport">
        <button
          type="button"
          aria-label="Jump to the first bar"
          title="Jump to start (Home)"
          onClick={() => jump(0)}
          disabled={cursor <= 0}
        >
          ⏮
        </button>
        <button
          type="button"
          aria-label="Step back one bar"
          title="Step back (←)"
          onClick={() => {
            setPlaying(false);
            nudge(-1);
          }}
          disabled={cursor <= 0}
        >
          ◀
        </button>
        <button
          type="button"
          className="play"
          title="Play or pause the replay"
          aria-label={playing ? "PAUSE the replay" : atEnd ? "REPLAY from the start" : "PLAY the replay"}
          onClick={() => {
            if (playing) {
              setPlaying(false);
              return;
            }
            // Pressing play at the end replays the whole window.
            if (atEnd) {
              position.current = 0;
              onCursor(0);
            }
            setPlaying(true);
          }}
        >
          <span aria-hidden="true">{playing ? "❚❚" : atEnd ? "↻" : "▶"}</span>
        </button>
        <button
          type="button"
          aria-label="Step forward one bar"
          title="Step forward (→)"
          onClick={() => {
            setPlaying(false);
            nudge(1);
          }}
          disabled={atEnd}
        >
          ▶
        </button>
        <button
          type="button"
          aria-label="Jump to the last bar"
          title="Jump to the end (End)"
          onClick={() => jump(barCount - 1)}
          disabled={atEnd}
        >
          ⏭
        </button>
      </div>

      <div className="scrubber">
        <ScrubMap equity={equity} cursor={cursor} splitIndex={splitIndex} />
        <input
          type="range"
          aria-label="Playback position"
          aria-valuetext={`${label}, bar ${cursor + 1} of ${barCount}`}
          min={0}
          max={Math.max(0, barCount - 1)}
          value={cursor}
          onChange={(event) => jump(Number(event.target.value))}
        />
      </div>

      <span className="playback-readout">
        <b>{label}</b>
        <span className="muted">
          bar {cursor + 1}/{barCount}
          {atEnd ? " · end" : ""}
        </span>
      </span>

      <div className="segmented" role="group" aria-label="Playback speed">
        {SPEEDS.map((option) => (
          <button
            type="button"
            key={option}
            className={option === speed ? "active" : ""}
            aria-pressed={option === speed}
            aria-label={`Play at ${option} times speed`}
            onClick={() => setSpeed(option)}
          >
            {option}×
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The equity curve, drawn behind the scrubber. Scrubbing blind is how you miss
 * a drawdown; with the shape underneath, the playhead has somewhere to be going,
 * and the dashed line marks where out-of-sample begins.
 */
function ScrubMap({
  equity,
  cursor,
  splitIndex,
}: {
  equity: readonly number[];
  cursor: number;
  splitIndex: number;
}) {
  const geometry = useMemo(() => {
    if (equity.length < 2) return null;

    const width = 100;
    const height = 34;
    // A fixed sample budget keeps a 6,000-bar curve as cheap to redraw as a short one.
    const step = Math.max(1, Math.floor(equity.length / 240));
    const points: { x: number; y: number; index: number }[] = [];
    const minimum = Math.min(...equity);
    const maximum = Math.max(...equity);
    const range = maximum - minimum || 1;

    for (let index = 0; index < equity.length; index += step) {
      points.push({
        x: (index / (equity.length - 1)) * width,
        y: height - 2 - ((equity[index] - minimum) / range) * (height - 4),
        index,
      });
    }

    const draw = (subset: typeof points) =>
      subset
        .map(({ x, y }, position) => `${position === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
        .join(" ");

    const played = points.filter((point) => point.index <= cursor);
    const tail = played.at(-1);

    return {
      width,
      height,
      full: draw(points),
      played: played.length > 1 ? draw(played) : "",
      area:
        played.length > 1 && tail
          ? `${draw(played)} L ${tail.x.toFixed(2)} ${height} L 0 ${height} Z`
          : "",
      split:
        splitIndex > 0 && splitIndex < equity.length
          ? (splitIndex / (equity.length - 1)) * width
          : null,
    };
  }, [equity, cursor, splitIndex]);

  if (!geometry) return <span className="scrub-map" aria-hidden="true" />;

  return (
    <svg
      className="scrub-map"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {geometry.area ? <path className="scrub-area" d={geometry.area} /> : null}
      <path d={geometry.full} />
      {geometry.played ? <path className="scrub-played" d={geometry.played} /> : null}
      {geometry.split !== null ? (
        <path
          className="scrub-split"
          d={`M ${geometry.split.toFixed(2)} 0 L ${geometry.split.toFixed(2)} ${geometry.height}`}
        />
      ) : null}
    </svg>
  );
}
