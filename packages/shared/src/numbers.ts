/** Clamp helpers shared by the inference engine and the simulation layer. */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Sound DNA axes live in [-1, 1]. */
export function clampAxis(value: number): number {
  return clamp(roundTo(value, 3), -1, 1);
}

/** Skills and psychology live in [0, 100] as integers. */
export function clampStat(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Groups digits with commas.
 *
 * Deliberately not `toLocaleString`: ICU data differs between Node versions and
 * browsers (en-ZA groups with a space), which would both contradict the
 * intended presentation and cause server/client hydration mismatches.
 */
export function groupDigits(value: number): string {
  const negative = value < 0;
  const [whole, fraction] = Math.abs(value).toString().split(".");
  const grouped = (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** Formats a large-ish count for stat tiles: 0, 940, 12.4k, 3.1m. */
export function formatCount(value: number): string {
  if (value < 1000) return groupDigits(value);
  if (value < 1_000_000) return `${roundTo(value / 1000, 1)}k`;
  return `${roundTo(value / 1_000_000, 1)}m`;
}
