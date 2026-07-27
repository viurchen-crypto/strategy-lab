export const signClass = (value: number): string =>
  value > 0 ? "positive" : value < 0 ? "negative" : "";

export function formatCurrency(value: number, currency = "USD"): string {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 0 : 2,
  }).format(Math.abs(value));
  return value < 0 ? `-${formatted}` : formatted;
}

export function formatSignedCurrency(value: number, currency = "USD"): string {
  return (value > 0 ? "+" : "") + formatCurrency(value, currency);
}

export function formatPercent(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 2): string {
  return (value > 0 ? "+" : "") + formatPercent(value, digits);
}

export function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function formatPrice(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 10 ? 4 : 2,
  });
}

const DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "short" });
const DATE_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  dateStyle: "short",
  timeStyle: "short",
  hour12: false,
});

/** Unix seconds to a fixed-width UTC stamp; intraday timeframes include the time. */
export function formatTimestamp(seconds: number, withTime = false): string {
  const date = new Date(seconds * 1_000);
  return (withTime ? DATE_TIME : DATE).format(date).replace(",", "");
}

export const isIntraday = (timeframe: string): boolean => /m$|h$/.test(timeframe);

export function formatRelative(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1_000);
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}
