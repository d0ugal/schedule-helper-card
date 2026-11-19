import { describe, expect, it } from "vitest";
import {
  type Block,
  blockAt,
  createBlockAt,
  deleteBlock,
  insertBlock,
  isValidDay,
  mergeAdjacentEqual,
  normalise,
  resizeBlock,
  setBlockData,
} from "../../src/model";

const h = (hours: number) => hours * 60;
const t = (v: number): Record<string, unknown> => ({ target_temperature: v });

/** The mock day: 00-08 at 18, 08-16 at 14, 16-24 at 18. */
function day(): Block[] {
  return [
    { start: h(0), end: h(8), data: t(18) },
    { start: h(8), end: h(16), data: t(14) },
    { start: h(16), end: h(24), data: t(18) },
  ];
}

function spans(blocks: readonly Block[]): [number, number, unknown][] {
  return blocks.map((b) => [
    b.start / 60,
    b.end / 60,
    (b.data as { target_temperature?: number })?.target_temperature,
  ]);
}

describe("normalise", () => {
  it("sorts, clamps and drops empty blocks", () => {
    const out = normalise([
      { start: h(10), end: h(12) },
      { start: -30, end: h(2) },
      { start: h(5), end: h(5) },
      { start: h(23), end: h(30) },
    ]);
    expect(spans(out)).toEqual([
      [0, 2, undefined],
      [10, 12, undefined],
      [23, 24, undefined],
    ]);
  });

  it("trims an earlier block that overlaps a later one", () => {
    const out = normalise([
      { start: h(0), end: h(10), data: t(1) },
      { start: h(8), end: h(12), data: t(2) },
    ]);
    expect(spans(out)).toEqual([
      [0, 8, 1],
      [8, 12, 2],
    ]);
  });

  it("does not mutate its input", () => {
    const input = day();
    normalise(input);
    expect(spans(input)).toEqual(spans(day()));
  });
});

describe("isValidDay and blockAt", () => {
  it("accepts a good day and rejects overlaps, gaps in order and out of range", () => {
    expect(isValidDay(day())).toBe(true);
    expect(isValidDay([])).toBe(true);
    expect(
      isValidDay([
        { start: 0, end: 600 },
        { start: 500, end: 700 },
      ]),
    ).toBe(false);
    expect(isValidDay([{ start: 600, end: 600 }])).toBe(false);
    expect(isValidDay([{ start: 0, end: 1500 }])).toBe(false);
  });

  it("finds the block at a minute, with half-open ends", () => {
    expect(blockAt(day(), h(8))).toBe(1);
    expect(blockAt(day(), h(8) - 1)).toBe(0);
    expect(blockAt(day(), h(24) - 1)).toBe(2);
    expect(blockAt([{ start: 60, end: 120 }], 30)).toBe(-1);
  });
});

describe("insertBlock", () => {
  it("splits a block that contains the new one, keeping data on both halves", () => {
    const r = insertBlock(day(), { start: h(12), end: h(13), data: t(19) });
    expect(spans(r.blocks)).toEqual([
      [0, 8, 18],
      [8, 12, 14],
      [12, 13, 19],
      [13, 16, 14],
      [16, 24, 18],
    ]);
    expect(r.index).toBe(2);
    expect(r.effects).toHaveLength(1);
    expect(r.effects[0]?.kind).toBe("pushed");
    expect(isValidDay(r.blocks)).toBe(true);
  });

  it("trims both neighbours when it straddles a boundary", () => {
    const r = insertBlock(day(), { start: h(7), end: h(9), data: t(20) });
    expect(spans(r.blocks)).toEqual([
      [0, 7, 18],
      [7, 9, 20],
      [9, 16, 14],
      [16, 24, 18],
    ]);
    expect(r.effects.map((e) => e.kind)).toEqual(["pushed", "pushed"]);
  });

  it("replaces blocks it covers completely", () => {
    const r = insertBlock(day(), { start: h(6), end: h(18), data: t(21) });
    expect(spans(r.blocks)).toEqual([
      [0, 6, 18],
      [6, 18, 21],
      [18, 24, 18],
    ]);
    expect(r.effects.map((e) => e.kind)).toEqual(["pushed", "replaced", "pushed"]);
    expect(r.effects[1]?.original.data).toEqual(t(14));
  });

  it("replaces a block it matches exactly", () => {
    const r = insertBlock(day(), { start: h(8), end: h(16), data: t(22) });
    expect(spans(r.blocks)).toEqual([
      [0, 8, 18],
      [8, 16, 22],
      [16, 24, 18],
    ]);
    expect(r.effects.map((e) => e.kind)).toEqual(["replaced"]);
  });

  it("works on an empty day and with touching neighbours left alone", () => {
    const r = insertBlock([{ start: 0, end: h(8) }], { start: h(8), end: h(9) });
    expect(r.blocks).toHaveLength(2);
    expect(r.effects).toEqual([]);
    expect(insertBlock([], { start: h(1), end: h(2) }).index).toBe(0);
  });

  it("drops leftovers shorter than the minimum", () => {
    const r = insertBlock(
      day(),
      { start: h(8) + 2, end: h(16) - 2, data: t(19) },
      { minLength: 5 },
    );
    expect(spans(r.blocks).map((s) => s[2])).toEqual([18, 19, 18]);
    expect(r.effects[0]?.kind).toBe("replaced");
  });

  it("enforces the minimum length and the day bounds", () => {
    expect(insertBlock([], { start: 100, end: 101 }).blocks[0]).toEqual({ start: 100, end: 105 });
    expect(insertBlock([], { start: 1438, end: 1500 }).blocks[0]).toEqual({
      start: 1435,
      end: 1440,
    });
    expect(insertBlock([], { start: -50, end: 10 }).blocks[0]).toEqual({ start: 0, end: 10 });
  });

  it("does not mutate its input or share data objects", () => {
    const input = day();
    const data = t(19);
    const r = insertBlock(input, { start: h(12), end: h(13), data });
    expect(spans(input)).toEqual(spans(day()));
    expect(r.blocks[2]?.data).not.toBe(data);
    expect(r.blocks[1]?.data).not.toBe(r.blocks[3]?.data);
  });
});

describe("createBlockAt", () => {
  it("creates a one hour block at the snapped click", () => {
    const r = createBlockAt(day(), h(12) + 2, t(19));
    expect(r.blocks[r.index]).toEqual({ start: h(12), end: h(13), data: t(19) });
  });

  it("snaps to the step", () => {
    const r = createBlockAt([], h(12) + 17, undefined, { step: 5 });
    expect(r.blocks[0]).toEqual({ start: h(12) + 15, end: h(13) + 15 });
  });

  it("moves back to fit before midnight", () => {
    const r = createBlockAt(day(), h(23) + 50, t(19));
    expect(r.blocks[r.index]).toEqual({ start: h(23), end: h(24), data: t(19) });
    expect(isValidDay(r.blocks)).toBe(true);
  });

  it("honours a custom length", () => {
    const r = createBlockAt([], h(1), undefined, { length: 30 });
    expect(r.blocks[0]).toEqual({ start: h(1), end: h(1) + 30 });
  });
});

describe("resizeBlock: end edge", () => {
  /** After step 2 of the mock: a 12-13 block at 19. */
  function withNew(): Block[] {
    return insertBlock(day(), { start: h(12), end: h(13), data: t(19) }).blocks;
  }

  it("pushes the next block when the end is dragged into it", () => {
    const r = resizeBlock(withNew(), 2, "end", h(15));
    expect(spans(r.blocks)).toEqual([
      [0, 8, 18],
      [8, 12, 14],
      [12, 15, 19],
      [15, 16, 14],
      [16, 24, 18],
    ]);
    expect(r.index).toBe(2);
    expect(r.effects).toHaveLength(1);
    expect(r.effects[0]).toMatchObject({ kind: "pushed", result: { start: h(15), end: h(16) } });
  });

  it("replaces a block that is covered completely and pushes the one after", () => {
    const r = resizeBlock(withNew(), 2, "end", h(17));
    expect(spans(r.blocks)).toEqual([
      [0, 8, 18],
      [8, 12, 14],
      [12, 17, 19],
      [17, 24, 18],
    ]);
    expect(r.effects.map((e) => e.kind)).toEqual(["replaced", "pushed"]);
    expect(r.effects[0]?.original).toMatchObject({ start: h(13), end: h(16) });
    expect(r.effects[1]?.result).toMatchObject({ start: h(17), end: h(24) });
  });

  it("replaces a block exactly covered", () => {
    const r = resizeBlock(withNew(), 2, "end", h(16));
    expect(spans(r.blocks)).toEqual([
      [0, 8, 18],
      [8, 12, 14],
      [12, 16, 19],
      [16, 24, 18],
    ]);
    expect(r.effects.map((e) => e.kind)).toEqual(["replaced"]);
  });

  it("replaces a block when the leftover would be below the minimum", () => {
    const r = resizeBlock(withNew(), 2, "end", h(16) - 3);
    expect(r.blocks.map((b) => b.start)).not.toContain(h(16) - 3);
    expect(r.effects.map((e) => e.kind)).toEqual(["replaced"]);
    expect(isValidDay(r.blocks)).toBe(true);
  });

  it("covers several blocks at once", () => {
    const r = resizeBlock(day(), 0, "end", h(20));
    expect(spans(r.blocks)).toEqual([
      [0, 20, 18],
      [20, 24, 18],
    ]);
    expect(r.effects.map((e) => e.kind)).toEqual(["replaced", "pushed"]);
  });

  it("extends to midnight and replaces everything after", () => {
    const r = resizeBlock(day(), 0, "end", h(24));
    expect(spans(r.blocks)).toEqual([[0, 24, 18]]);
    expect(r.effects.map((e) => e.kind)).toEqual(["replaced", "replaced"]);
  });

  it("clamps beyond midnight", () => {
    const r = resizeBlock(day(), 2, "end", 5000);
    expect(r.blocks[2]?.end).toBe(1440);
  });

  it("leaves a gap when shrinking and touches no neighbour", () => {
    const r = resizeBlock(day(), 1, "end", h(12));
    expect(spans(r.blocks)).toEqual([
      [0, 8, 18],
      [8, 12, 14],
      [16, 24, 18],
    ]);
    expect(r.effects).toEqual([]);
  });

  it("keeps the minimum length when shrinking", () => {
    const r = resizeBlock(day(), 1, "end", h(8) - 100);
    expect(r.blocks[1]).toMatchObject({ start: h(8), end: h(8) + 5 });
    expect(resizeBlock(day(), 1, "end", h(8), { minLength: 15 }).blocks[1]?.end).toBe(h(8) + 15);
  });

  it("does nothing to neighbours that only touch", () => {
    const r = resizeBlock(day(), 0, "end", h(8));
    expect(spans(r.blocks)).toEqual(spans(day()));
    expect(r.effects).toEqual([]);
  });

  it("throws for a missing block", () => {
    expect(() => resizeBlock(day(), 9, "end", 10)).toThrow(RangeError);
  });
});

describe("resizeBlock: start edge (mirrored)", () => {
  function withNew(): Block[] {
    return insertBlock(day(), { start: h(12), end: h(13), data: t(19) }).blocks;
  }

  it("pushes the previous block when the start is dragged into it", () => {
    const r = resizeBlock(withNew(), 2, "start", h(10));
    expect(spans(r.blocks)).toEqual([
      [0, 8, 18],
      [8, 10, 14],
      [10, 13, 19],
      [13, 16, 14],
      [16, 24, 18],
    ]);
    expect(r.index).toBe(2);
    expect(r.effects[0]).toMatchObject({ kind: "pushed", result: { start: h(8), end: h(10) } });
  });

  it("replaces a block that is covered completely and pushes the one before", () => {
    const r = resizeBlock(withNew(), 2, "start", h(6));
    expect(spans(r.blocks)).toEqual([
      [0, 6, 18],
      [6, 13, 19],
      [13, 16, 14],
      [16, 24, 18],
    ]);
    expect(r.index).toBe(1);
    expect(r.effects.map((e) => e.kind)).toEqual(["replaced", "pushed"]);
  });

  it("replaces a block that is exactly covered", () => {
    const r = resizeBlock(withNew(), 2, "start", h(8));
    expect(spans(r.blocks)).toEqual([
      [0, 8, 18],
      [8, 13, 19],
      [13, 16, 14],
      [16, 24, 18],
    ]);
    expect(r.effects.map((e) => e.kind)).toEqual(["replaced"]);
  });

  it("clamps at midnight (start of day) and replaces everything before", () => {
    const r = resizeBlock(day(), 2, "start", -100);
    expect(spans(r.blocks)).toEqual([[0, 24, 18]]);
  });

  it("leaves a gap when moving away from the neighbour", () => {
    const r = resizeBlock(day(), 1, "start", h(10));
    expect(spans(r.blocks)).toEqual([
      [0, 8, 18],
      [10, 16, 14],
      [16, 24, 18],
    ]);
    expect(r.effects).toEqual([]);
  });

  it("keeps the minimum length", () => {
    const r = resizeBlock(day(), 1, "start", h(20));
    expect(r.blocks[1]).toMatchObject({ start: h(16) - 5, end: h(16) });
  });

  it("is the mirror image of the end edge", () => {
    const mirror = (blocks: Block[]): Block[] =>
      blocks.map((b) => ({ ...b, start: 1440 - b.end, end: 1440 - b.start })).reverse();
    const base = withNew();
    const direct = resizeBlock(base, 2, "start", h(10)).blocks;
    const viaMirror = mirror(resizeBlock(mirror(base), 2, "end", 1440 - h(10)).blocks);
    expect(direct).toEqual(viaMirror);
  });
});

describe("setBlockData and deleteBlock", () => {
  it("replaces data on one block without touching the others", () => {
    const out = setBlockData(day(), 1, { target_temperature: 15, cold_bonus: 1.5 });
    expect(out[1]?.data).toEqual({ target_temperature: 15, cold_bonus: 1.5 });
    expect(out[0]?.data).toEqual(t(18));
  });

  it("can clear data", () => {
    expect(setBlockData(day(), 0, undefined)[0]).toEqual({ start: 0, end: h(8) });
  });

  it("deletes a block and leaves a gap", () => {
    const out = deleteBlock(day(), 1);
    expect(spans(out)).toEqual([
      [0, 8, 18],
      [16, 24, 18],
    ]);
  });
});

describe("mergeAdjacentEqual", () => {
  it("joins touching blocks with the same data, regardless of key order", () => {
    const out = mergeAdjacentEqual([
      { start: 0, end: 60, data: { a: 1, b: 2 } },
      { start: 60, end: 120, data: { b: 2, a: 1 } },
      { start: 120, end: 180, data: { a: 1 } },
    ]);
    expect(out).toEqual([
      { start: 0, end: 120, data: { a: 1, b: 2 } },
      { start: 120, end: 180, data: { a: 1 } },
    ]);
  });

  it("does not join across a gap or different data", () => {
    expect(
      mergeAdjacentEqual([
        { start: 0, end: 60 },
        { start: 90, end: 120 },
      ]),
    ).toHaveLength(2);
    expect(mergeAdjacentEqual(day())).toHaveLength(3);
  });

  it("treats missing data and empty data as equal", () => {
    expect(
      mergeAdjacentEqual([
        { start: 0, end: 60 },
        { start: 60, end: 90, data: {} },
      ]),
    ).toHaveLength(1);
  });
});

describe("invariants under random edits", () => {
  function rng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  it("always yields a valid day", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = rng(seed);
      let blocks = day();
      for (let step = 0; step < 60; step++) {
        const op = rand();
        const minute = Math.floor(rand() * 1500) - 30;
        if (op < 0.3) {
          blocks = createBlockAt(blocks, minute, t(Math.floor(rand() * 30))).blocks;
        } else if (op < 0.85 && blocks.length > 0) {
          const index = Math.floor(rand() * blocks.length);
          blocks = resizeBlock(blocks, index, rand() < 0.5 ? "start" : "end", minute).blocks;
        } else if (blocks.length > 1) {
          blocks = deleteBlock(blocks, Math.floor(rand() * blocks.length));
        }
        expect(isValidDay(blocks), `seed ${seed} step ${step}`).toBe(true);
        for (const b of blocks) expect(b.end - b.start).toBeGreaterThanOrEqual(5);
      }
    }
  });
});
