"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface PaletteAction {
  readonly id: string;
  /** Heading the action is filed under; groups render in first-seen order. */
  readonly group: string;
  readonly label: string;
  readonly note?: string;
  readonly glyph: string;
  /** Extra words the filter should match but the row should not show. */
  readonly keywords?: string;
  readonly run: () => void;
}

/**
 * ⌘K over the whole app.
 *
 * The terminal was the only way to reach most of this app's power, which meant
 * you had to already know the verbs. The palette is the same set of actions
 * with a discoverable front door — and it dispatches into the very same
 * handlers the terminal does, so there is one behaviour, not two.
 */
export function Palette({
  onClose,
  actions,
}: {
  onClose: () => void;
  actions: readonly PaletteAction[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => filter(actions, query), [actions, query]);

  /**
   * Ranking is flat but the list is grouped, so the ranked order is folded back
   * into groups by where each group's best match landed. Without this the same
   * heading reappears every time the ranking interleaves two groups.
   */
  const groups = useMemo(() => {
    const byName = new Map<string, { name: string; items: { action: PaletteAction; index: number }[] }>();
    matches.forEach((action, index) => {
      const group = byName.get(action.group) ?? { name: action.group, items: [] };
      group.items.push({ action, index });
      byName.set(action.group, group);
    });
    return [...byName.values()];
  }, [matches]);

  // Keep the highlighted row on screen while arrowing through a long list.
  useEffect(() => {
    // `scrollIntoView` is absent in jsdom and in some older embedded browsers.
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const choose = (action: PaletteAction | undefined) => {
    if (!action) return;
    onClose();
    action.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      setActive((index) => (matches.length === 0 ? 0 : (index + 1) % matches.length));
      return;
    }
    if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setActive((index) => (matches.length === 0 ? 0 : (index - 1 + matches.length) % matches.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      choose(matches[active]);
    }
  };

  return (
    <div
      className="palette-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <span aria-hidden="true">⌘</span>
          <input
            autoFocus
            aria-label="Search commands"
            aria-controls="palette-results"
            placeholder="Search symbols, timeframes, strategies, settings…"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(event) => {
              // A narrowing search puts the highlight back on the best match.
              setQuery(event.target.value);
              setActive(0);
            }}
          />
        </div>

        <div className="palette-results" id="palette-results" ref={listRef} role="listbox" aria-label="Commands">
          {matches.length === 0 ? (
            <p className="palette-empty">Nothing matches “{query}”.</p>
          ) : (
            groups.map((group) => (
              <div key={group.name}>
                <p className="palette-group">{group.name}</p>
                {group.items.map(({ action, index }) => (
                  <button
                    type="button"
                    role="option"
                    key={action.id}
                    aria-selected={index === active}
                    className="palette-item"
                    data-active={index === active}
                    onMouseMove={() => setActive(index)}
                    onClick={() => choose(action)}
                  >
                    <span className="glyph" aria-hidden="true">
                      {action.glyph}
                    </span>
                    <span className="palette-label">{action.label}</span>
                    {action.note ? <span className="palette-note">{action.note}</span> : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="palette-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Subsequence matching, so "btcd" finds "BTC-USD · Bitcoin". Ties break on how
 * early and how tightly the query lands, which keeps exact prefixes on top.
 */
function filter(actions: readonly PaletteAction[], query: string): PaletteAction[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...actions];

  const scored: { action: PaletteAction; score: number; order: number }[] = [];

  actions.forEach((action, order) => {
    const haystack = `${action.label} ${action.note ?? ""} ${action.keywords ?? ""}`.toLowerCase();
    let cursor = 0;
    let first = -1;
    let last = 0;

    for (const character of needle) {
      const found = haystack.indexOf(character, cursor);
      if (found === -1) return;
      if (first === -1) first = found;
      last = found;
      cursor = found + 1;
    }

    scored.push({ action, score: first * 4 + (last - first), order });
  });

  return scored
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map(({ action }) => action);
}
