export interface Range {
  min: number;
  max: number;
}

const COLD = "#5aa7e6";
const MID = "#ffb454";
const HOT = "#ff7a45";

/**
 * Colour scale from cold blue through amber to orange over the given range. Blends are done
 * in oklab so the middle stays amber instead of passing through green.
 */
export function colorFor(value: number | undefined, range: Range): string {
  if (value === undefined || !Number.isFinite(value)) return "var(--shc-neutral, #7c8494)";
  const span = range.max - range.min;
  const t = span <= 0 ? 0.5 : Math.min(Math.max((value - range.min) / span, 0), 1);
  if (t === 0) return COLD;
  if (t === 1) return HOT;
  if (t === 0.5) return MID;
  if (t < 0.5) return `color-mix(in oklab, ${MID} ${Math.round(t * 200)}%, ${COLD})`;
  return `color-mix(in oklab, ${HOT} ${Math.round((t - 0.5) * 200)}%, ${MID})`;
}

/** Range of the values in use, widened so a small spread still shows contrast. */
export function rangeOf(values: readonly number[], fallback?: Range): Range {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return fallback ?? { min: 0, max: 1 };
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (max - min < 4) {
    const mid = (min + max) / 2;
    min = mid - 2;
    max = mid + 2;
  }
  return { min, max };
}
