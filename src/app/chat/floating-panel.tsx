"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "sl-chat-position";
const BUBBLE_KEY = "sl-chat-collapsed";
const MARGIN = 8;

interface Position {
  x: number;
  y: number;
}

/**
 * Keeps the panel on screen. A position saved on a 34-inch monitor would put the
 * window somewhere in the next county on a laptop, so every read and every
 * resize clamps back into the viewport rather than trusting what was stored.
 */
const clamp = (position: Position, width: number, height: number): Position => ({
  x: Math.min(Math.max(MARGIN, position.x), Math.max(MARGIN, window.innerWidth - width - MARGIN)),
  y: Math.min(Math.max(MARGIN, position.y), Math.max(MARGIN, window.innerHeight - height - MARGIN)),
});

/**
 * True only after hydration. The panel's placement depends on `window`, which
 * the server does not have, so the first client render must agree with the
 * server's "nothing here" before it is allowed to measure anything.
 */
const subscribeNothing = () => () => {};
const useIsClient = () => useSyncExternalStore(subscribeNothing, () => true, () => false);

const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(BUBBLE_KEY) !== "false";
  } catch {
    return true;
  }
};

const read = (): Position | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return typeof parsed?.x === "number" && typeof parsed?.y === "number" ? parsed : null;
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Losing the position is not worth failing the drag over.
  }
};

interface FloatingPanelProps {
  title: string;
  /** Shown on the bubble when there is unseen output. */
  unread?: number;
  /** Bump to pop the window open from elsewhere — typing into the command line, say. */
  openRequest?: number;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}

/**
 * A window that lives above the app: draggable anywhere, collapsible to a
 * bubble, and remembered between visits.
 *
 * Dragging moves a `transform` rather than `left`/`top` so the browser can keep
 * it on the compositor — the panel stays glued to the pointer instead of
 * lagging a frame behind it.
 */
export function FloatingPanel({
  title,
  unread = 0,
  openRequest = 0,
  onCollapsedChange,
  children,
  headerExtra,
}: FloatingPanelProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [seenRequest, setSeenRequest] = useState(openRequest);
  const isClient = useIsClient();
  const [dragging, setDragging] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const grab = useRef<Position>({ x: 0, y: 0 });

  // Placed on the first client render, from storage or from the bottom-right
  // corner. Deriving it here rather than in an effect means the window never
  // paints once in the wrong place and then jumps.
  if (isClient && position === null) {
    const width = 360;
    const height = 480;
    setPosition(
      clamp(
        read() ?? { x: window.innerWidth - width - 24, y: window.innerHeight - height - 96 },
        width,
        height,
      ),
    );
    setCollapsed(readCollapsed());
  }

  // A window that resizes out from under the panel must not strand it offscreen.
  useEffect(() => {
    const onResize = () => {
      const element = panel.current;
      if (!element) return;
      setPosition((current) =>
        current ? clamp(current, element.offsetWidth, element.offsetHeight) : current,
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    // Buttons in the header are controls, not drag handles.
    if ((event.target as HTMLElement).closest("button")) return;
    const element = panel.current;
    if (!element || !position) return;

    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    grab.current = { x: event.clientX - position.x, y: event.clientY - position.y };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const element = panel.current;
    if (!dragging || !element) return;
    setPosition(
      clamp(
        { x: event.clientX - grab.current.x, y: event.clientY - grab.current.y },
        element.offsetWidth,
        element.offsetHeight,
      ),
    );
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!dragging) return;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    setDragging(false);
    if (position) write(STORAGE_KEY, position);
  };

  /** The keyboard gets the same freedom the pointer does. */
  const onHeaderKeyDown = (event: React.KeyboardEvent) => {
    const element = panel.current;
    if (!element || !position) return;

    const nudge = event.shiftKey ? 40 : 12;
    const moves: Record<string, Position> = {
      ArrowLeft: { x: -nudge, y: 0 },
      ArrowRight: { x: nudge, y: 0 },
      ArrowUp: { x: 0, y: -nudge },
      ArrowDown: { x: 0, y: nudge },
    };

    if (event.key === "Escape") {
      setCollapse(true);
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = clamp(
      { x: position.x + move.x, y: position.y + move.y },
      element.offsetWidth,
      element.offsetHeight,
    );
    setPosition(next);
    write(STORAGE_KEY, next);
  };

  const setCollapse = useCallback(
    (value: boolean) => {
      setCollapsed(value);
      write(BUBBLE_KEY, value);
      onCollapsedChange?.(value);
    },
    [onCollapsedChange],
  );

  // Adjusting state from a changed prop during render, rather than in an effect:
  // the window opens on the same paint as the message that opened it.
  if (openRequest !== seenRequest) {
    setSeenRequest(openRequest);
    if (collapsed) setCollapse(false);
  }

  // Nothing is placed until the viewport has been measured.
  if (!position) return null;

  const style = { transform: `translate3d(${position.x}px, ${position.y}px, 0)` };

  if (collapsed) {
    return (
      <button
        type="button"
        ref={panel as React.RefObject<HTMLButtonElement | null>}
        className="chat-bubble"
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (!dragging) setCollapse(false);
        }}
        aria-label={unread > 0 ? `${title}, ${unread} new` : `Open ${title}`}
        title={`${title} — drag to move`}
      >
        <span aria-hidden="true">✦</span>
        {unread > 0 ? <span className="chat-bubble-dot" aria-hidden="true" /> : null}
      </button>
    );
  }

  return (
    <section
      ref={panel as React.RefObject<HTMLElement | null>}
      className={dragging ? "chat-window dragging" : "chat-window"}
      style={style}
      aria-label={title}
    >
      <header
        className="chat-header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onHeaderKeyDown}
        tabIndex={0}
        role="toolbar"
        aria-label={`${title} window — arrow keys move it`}
      >
        <span className="chat-grip" aria-hidden="true">
          ⠿
        </span>
        <span className="chat-title">{title}</span>
        {headerExtra}
        <button
          type="button"
          className="icon-button chat-collapse"
          onClick={() => setCollapse(true)}
          aria-label="Collapse to a bubble"
          title="Collapse (Esc)"
        >
          <span aria-hidden="true">—</span>
        </button>
      </header>
      {children}
    </section>
  );
}
