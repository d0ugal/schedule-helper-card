/**
 * Keep gutter items (chip and notes) from overlapping: items are placed top to bottom,
 * each pushed down until it clears the previous one by `gap` pixels.
 * Returns the adjusted tops in the order given.
 */
export function stackTops(tops: readonly number[], gap = 22): number[] {
  const order = tops.map((top, i) => ({ top, i })).sort((a, b) => a.top - b.top || a.i - b.i);
  const out = new Array<number>(tops.length);
  let floor = -Infinity;
  for (const item of order) {
    const top = Math.max(item.top, floor);
    out[item.i] = top;
    floor = top + gap;
  }
  return out;
}
