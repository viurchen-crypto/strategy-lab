"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ThemeChoice = "dark" | "light" | "system";
export type Density = "compact" | "default" | "comfortable";

const THEME_KEY = "sl-theme";
const DENSITY_KEY = "sl-density";

export const THEME_ORDER: readonly ThemeChoice[] = ["dark", "light", "system"];
export const DENSITY_ORDER: readonly Density[] = ["compact", "default", "comfortable"];

const THEME_GLYPH: Record<ThemeChoice, string> = { dark: "◐", light: "☀", system: "◑" };
const DENSITY_GLYPH: Record<Density, string> = { compact: "▪", default: "▬", comfortable: "▮" };

/**
 * Appearance is external state: the inline script in `layout.tsx` sets it before
 * React exists, and `localStorage` owns it between visits. So it is read through
 * `useSyncExternalStore` rather than mirrored into React state — that is what
 * keeps the server render, the pre-paint script and the toggle in agreement
 * instead of racing each other on the first frame.
 */
const listeners = new Set<() => void>();
let snapshot: { theme: ThemeChoice; density: Density } | null = null;

const readStored = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const stored = window.localStorage.getItem(key) as T | null;
    return stored && allowed.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

const SERVER_SNAPSHOT = { theme: "dark", density: "default" } as const;

function getSnapshot() {
  // The object identity has to be stable between renders or React loops forever.
  snapshot ??= {
    theme: readStored(THEME_KEY, THEME_ORDER, "dark"),
    density: readStored(DENSITY_KEY, DENSITY_ORDER, "default"),
  };
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const resolve = (choice: ThemeChoice): "dark" | "light" => {
  if (choice !== "system") return choice;
  if (typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

function commit(next: { theme: ThemeChoice; density: Density }) {
  snapshot = next;
  document.documentElement.dataset.theme = resolve(next.theme);
  document.documentElement.dataset.density = next.density;
  try {
    window.localStorage.setItem(THEME_KEY, next.theme);
    window.localStorage.setItem(DENSITY_KEY, next.density);
  } catch {
    // A blocked storage quota is not a reason to refuse to change the theme.
  }
  for (const listener of listeners) listener();
}

/** Following the system only means anything if it keeps following it. */
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (getSnapshot().theme === "system") commit({ ...getSnapshot() });
  });
}

export function useAppearance() {
  const { theme, density } = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);

  const setTheme = useCallback((next: ThemeChoice) => commit({ ...getSnapshot(), theme: next }), []);
  const setDensity = useCallback(
    (next: Density) => commit({ ...getSnapshot(), density: next }),
    [],
  );

  const cycleTheme = useCallback(
    () => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(getSnapshot().theme) + 1) % THEME_ORDER.length]),
    [setTheme],
  );

  const cycleDensity = useCallback(
    () =>
      setDensity(
        DENSITY_ORDER[(DENSITY_ORDER.indexOf(getSnapshot().density) + 1) % DENSITY_ORDER.length],
      ),
    [setDensity],
  );

  return {
    theme,
    density,
    setTheme,
    setDensity,
    cycleTheme,
    cycleDensity,
    themeGlyph: THEME_GLYPH[theme],
    densityGlyph: DENSITY_GLYPH[density],
  };
}
