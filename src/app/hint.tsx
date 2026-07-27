"use client";

import { useId, useState } from "react";

/**
 * An explainer for a metric label. The previous version used `abbr title`,
 * which is invisible on touch and to screen readers that do not announce the
 * attribute — a plain-language gloss of "Sortino" is exactly the thing a
 * newcomer needs and exactly the thing a tooltip hides.
 *
 * This opens on hover, on focus and on tap alike, and is a real button so the
 * keyboard can reach it.
 */
export function Hint({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <button
      type="button"
      className="hint"
      data-open={open}
      aria-describedby={open ? id : undefined}
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {label}
      {open ? (
        <span className="hint-bubble" id={id} role="tooltip">
          {children}
        </span>
      ) : null}
    </button>
  );
}
