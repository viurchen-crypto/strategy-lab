/**
 * A 46×20 shape of an equity curve. Twenty rows of "+12.4%" tell you who won;
 * twenty little curves tell you *how* — one smooth ride, one lucky spike — and
 * that is the difference the number alone hides.
 *
 * Server-safe: pure geometry, no hooks, no measurement.
 */
export function Sparkline({
  values,
  tone,
  label,
}: {
  values: readonly number[];
  /** Positive draws in the gain colour, negative in the loss colour. */
  tone: number;
  label?: string;
}) {
  const path = buildPath(values, 46, 20);
  if (!path) return <span className="sparkline" aria-hidden="true" />;

  const stroke = tone > 0 ? "var(--pos)" : tone < 0 ? "var(--neg)" : "var(--ink-3)";
  return (
    <svg
      className="sparkline"
      viewBox="0 0 46 20"
      preserveAspectRatio="none"
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path className="spark-fill" d={`${path.line} L 46 20 L 0 20 Z`} fill={stroke} />
      <path d={path.line} stroke={stroke} />
    </svg>
  );
}

/**
 * Samples at most `width` points so a 6,000-bar curve still costs a fixed
 * amount to draw, and pads a flat series into the middle of the box rather
 * than dividing by a zero range.
 */
function buildPath(
  values: readonly number[],
  width: number,
  height: number,
): { line: string } | null {
  if (values.length < 2) return null;

  const step = Math.max(1, Math.floor(values.length / width));
  const sampled: number[] = [];
  for (let index = 0; index < values.length; index += step) sampled.push(values[index]);
  if (sampled.at(-1) !== values.at(-1)) sampled.push(values[values.length - 1]);

  const minimum = Math.min(...sampled);
  const maximum = Math.max(...sampled);
  const range = maximum - minimum;
  const inset = 1.5;
  const span = height - inset * 2;

  const line = sampled
    .map((value, index) => {
      const x = (index / (sampled.length - 1)) * width;
      const y = range === 0 ? height / 2 : inset + span - ((value - minimum) / range) * span;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return { line };
}
