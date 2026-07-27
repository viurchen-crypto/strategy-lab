"use client";

import { useEffect, useRef, useState } from "react";

interface PlaybackProps {
  /** Number of bars in the run; the cursor addresses `0 … barCount - 1`. */
  barCount: number;
  cursor: number;
  onCursor: (index: number) => void;
  label: string;
}

const SPEEDS = [1, 2, 5, 20] as const;
/** Bars advanced per second at 1×. */
const BASE_RATE = 12;

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Scrubs a finished backtest. Nothing here recomputes the run — the cursor only
 * limits how much of an already-computed result the panels are allowed to show.
 */
export function Playback({ barCount, cursor, onCursor, label }: PlaybackProps) {
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

    last.current = performance.now();
    const step = (now: number) => {
      const advanced = ((now - last.current) / 1_000) * BASE_RATE * speed;
      if (advanced >= 1) {
        last.current = now;
        const next = Math.min(barCount - 1, position.current + Math.floor(advanced));
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

  return (
    <div className="playback">
      <button type="button" aria-label="Step back" onClick={() => nudge(-1)} disabled={cursor <= 0}>
        ◀
      </button>
      <button
        type="button"
        className="play"
        onClick={() => {
          if (playing) {
            setPlaying(false);
            return;
          }
          if (prefersReducedMotion()) {
            // Animation is unwelcome: jump to the end rather than stepping there.
            onCursor(barCount - 1);
            return;
          }
          // Restarting from the end replays the whole window.
          if (atEnd) {
            onCursor(0);
            position.current = 0;
          }
          setPlaying(true);
        }}
      >
        {playing ? "❚❚ PAUSE" : "▶ PLAY"}
      </button>
      <button type="button" aria-label="Step forward" onClick={() => nudge(1)} disabled={atEnd}>
        ▶
      </button>
      <input
        type="range"
        aria-label="Playback position"
        min={0}
        max={Math.max(0, barCount - 1)}
        value={cursor}
        onChange={(event) => {
          setPlaying(false);
          onCursor(Number(event.target.value));
        }}
      />
      <span className="playback-label">{label}</span>
      <button
        type="button"
        className="speed"
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
      >
        {speed}×
      </button>
      <button type="button" className="speed" onClick={() => onCursor(barCount - 1)} disabled={atEnd}>
        END
      </button>
    </div>
  );
}
