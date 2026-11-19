import { DAY_MINUTES, clamp, snap } from "./time";

export type BlockData = Record<string, unknown>;

/** One time block of a day. `data` is optional and preserved untouched. */
export interface Block {
  start: number;
  end: number;
  data?: BlockData;
}

export interface EditOptions {
  /** Shortest allowed block, in minutes. Leftovers shorter than this are removed. */
  minLength?: number;
  /** Grid for snapping, in minutes. */
  step?: number;
}

export type Edge = "start" | "end";

/** What an edit did to a block other than the one being edited. */
export interface Effect {
  kind: "pushed" | "replaced";
  /** The neighbour as it was before the edit. */
  original: Block;
  /** The neighbour after the edit (absent when it was replaced). */
  result?: Block;
}

export interface EditResult {
  blocks: Block[];
  /** Index of the edited or inserted block in `blocks`. */
  index: number;
  effects: Effect[];
}

export const DEFAULT_MIN_LENGTH = 5;
export const DEFAULT_STEP = 5;

function minLen(options?: EditOptions): number {
  return options?.minLength ?? DEFAULT_MIN_LENGTH;
}

export function cloneBlock(block: Block): Block {
  return block.data === undefined
    ? { start: block.start, end: block.end }
    : { start: block.start, end: block.end, data: structuredClone(block.data) };
}

/**
 * Sort, clamp to the day and drop empty blocks. When blocks overlap, the later one (by
 * start time) wins and the earlier one is trimmed.
 */
export function normalise(blocks: readonly Block[]): Block[] {
  const sorted = blocks
    .map((b) => ({
      ...cloneBlock(b),
      start: clamp(b.start, 0, DAY_MINUTES),
      end: clamp(b.end, 0, DAY_MINUTES),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Block[] = [];
  for (const block of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.end > block.start) {
      prev.end = block.start;
      if (prev.end <= prev.start) out.pop();
    }
    out.push(block);
  }
  return out;
}

/** True when blocks are sorted, inside the day, non-empty and do not overlap. */
export function isValidDay(blocks: readonly Block[]): boolean {
  let cursor = 0;
  for (const b of blocks) {
    if (b.start < cursor || b.end <= b.start || b.end > DAY_MINUTES) return false;
    cursor = b.end;
  }
  return true;
}

/** Index of the block covering `minute`, or -1 for a gap. */
export function blockAt(blocks: readonly Block[], minute: number): number {
  return blocks.findIndex((b) => minute >= b.start && minute < b.end);
}

/**
 * Put a new block on the day. It wins over whatever it overlaps: covered blocks are
 * removed, partly covered ones are trimmed, and a block that contains the new one is split
 * in two (both halves keep their data). Pieces shorter than the minimum are dropped.
 */
export function insertBlock(
  blocks: readonly Block[],
  block: Block,
  options?: EditOptions,
): EditResult {
  const min = minLen(options);
  const start = clamp(block.start, 0, DAY_MINUTES - min);
  const end = clamp(block.end, start + min, DAY_MINUTES);
  const created = cloneBlock({ start, end, data: block.data });

  const out: Block[] = [];
  const effects: Effect[] = [];
  for (const n of blocks) {
    if (n.end <= start || n.start >= end) {
      out.push(cloneBlock(n));
      continue;
    }
    const left = start - n.start >= min ? { ...cloneBlock(n), end: start } : undefined;
    const right = n.end - end >= min ? { ...cloneBlock(n), start: end } : undefined;
    if (left) out.push(left);
    if (right) out.push(right);
    if (left || right) {
      effects.push({ kind: "pushed", original: cloneBlock(n), result: right ?? left });
    } else {
      effects.push({ kind: "replaced", original: cloneBlock(n) });
    }
  }
  out.push(created);
  out.sort((a, b) => a.start - b.start);
  return { blocks: out, index: out.indexOf(created), effects };
}

/**
 * Create a block at the clicked minute: snapped, one hour long by default, moved back to fit
 * when it would run past midnight.
 */
export function createBlockAt(
  blocks: readonly Block[],
  minute: number,
  data: BlockData | undefined,
  options?: EditOptions & { length?: number },
): EditResult {
  const length = options?.length ?? 60;
  const step = options?.step ?? DEFAULT_STEP;
  const start = clamp(snap(minute, step), 0, DAY_MINUTES - length);
  return insertBlock(blocks, { start, end: start + length, data }, options);
}

/**
 * Move one edge of a block. Moving an edge into a neighbour pushes that neighbour's
 * boundary; covering it completely, or leaving less than the minimum, replaces it.
 * Moving an edge away from a neighbour leaves a gap.
 */
export function resizeBlock(
  blocks: readonly Block[],
  index: number,
  edge: Edge,
  to: number,
  options?: EditOptions,
): EditResult {
  const min = minLen(options);
  if (!blocks[index]) throw new RangeError(`No block at index ${index}`);
  const out = blocks.map(cloneBlock);
  const self = out[index] as Block;
  const effects: Effect[] = [];
  const removed = new Set<number>();

  if (edge === "end") {
    self.end = clamp(to, self.start + min, DAY_MINUTES);
    for (let j = index + 1; j < out.length; j++) {
      const n = out[j] as Block;
      if (n.start >= self.end) break;
      if (n.end - self.end < min) {
        effects.push({ kind: "replaced", original: cloneBlock(blocks[j] as Block) });
        removed.add(j);
      } else {
        n.start = self.end;
        effects.push({
          kind: "pushed",
          original: cloneBlock(blocks[j] as Block),
          result: cloneBlock(n),
        });
      }
    }
  } else {
    self.start = clamp(to, 0, self.end - min);
    for (let j = index - 1; j >= 0; j--) {
      const n = out[j] as Block;
      if (n.end <= self.start) break;
      if (self.start - n.start < min) {
        effects.push({ kind: "replaced", original: cloneBlock(blocks[j] as Block) });
        removed.add(j);
      } else {
        n.end = self.start;
        effects.push({
          kind: "pushed",
          original: cloneBlock(blocks[j] as Block),
          result: cloneBlock(n),
        });
      }
    }
  }

  const kept = out.filter((_, j) => !removed.has(j));
  return { blocks: kept, index: kept.indexOf(self), effects };
}

/** Replace the data of one block. */
export function setBlockData(
  blocks: readonly Block[],
  index: number,
  data: BlockData | undefined,
): Block[] {
  return blocks.map((b, i) =>
    i === index ? cloneBlock({ start: b.start, end: b.end, data }) : cloneBlock(b),
  );
}

/** Remove one block, leaving a gap. */
export function deleteBlock(blocks: readonly Block[], index: number): Block[] {
  return blocks.filter((_, i) => i !== index).map(cloneBlock);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sameData(a: BlockData | undefined, b: BlockData | undefined): boolean {
  return stableStringify(a ?? {}) === stableStringify(b ?? {});
}

/** Join touching blocks that carry identical data. */
export function mergeAdjacentEqual(blocks: readonly Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (prev && prev.end === b.start && sameData(prev.data, b.data)) prev.end = b.end;
    else out.push(cloneBlock(b));
  }
  return out;
}
