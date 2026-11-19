import { describe, expect, it } from "vitest";
import {
  type RawSchedule,
  copyDay,
  parseBlocks,
  parseSchedule,
  serialiseBlocks,
  serialiseSchedule,
  withDay,
} from "../../src/model";

/** Trimmed from the live Flos Room Heating helper (`schedule/list`). */
const flo: RawSchedule = {
  id: "flos_room_heating",
  name: "Flos Room Heating",
  icon: "mdi:radiator",
  monday: [
    { from: "00:00:00", to: "08:00:00", data: { target_temperature: 18 } },
    { from: "08:00:00", to: "16:00:00", data: { target_temperature: 14 } },
    { from: "16:00:00", to: "17:00:00", data: { target_temperature: 18 } },
    { from: "17:00:00", to: "17:30:00", data: { target_temperature: 18, cold_bonus: 1.5 } },
    { from: "17:30:00", to: "24:00:00", data: { target_temperature: 18 } },
  ],
  tuesday: [{ from: "00:00:00", to: "24:00:00", data: { target_temperature: 14 } }],
};

describe("parseSchedule / serialiseSchedule", () => {
  it("round trips a real helper, including 24:00 ends and unconfigured data keys", () => {
    const parsed = parseSchedule(flo);
    const out = serialiseSchedule(parsed);
    expect(out.monday).toEqual(flo.monday);
    expect(out.tuesday).toEqual(flo.tuesday);
    expect(out.name).toBe("Flos Room Heating");
    expect(out.icon).toBe("mdi:radiator");
  });

  it("fills missing days with empty lists", () => {
    const out = serialiseSchedule(parseSchedule(flo));
    expect(out.wednesday).toEqual([]);
    expect(out.sunday).toEqual([]);
  });

  it("sends the icon back, because the update replaces the whole item", () => {
    expect(serialiseSchedule(parseSchedule(flo))).toHaveProperty("icon", "mdi:radiator");
  });

  it("omits the icon when there was none", () => {
    const out = serialiseSchedule(parseSchedule({ name: "x" }));
    expect(out).not.toHaveProperty("icon");
  });

  it("does not include the id in the payload", () => {
    expect(serialiseSchedule(parseSchedule(flo))).not.toHaveProperty("id");
    expect(parseSchedule(flo).id).toBe("flos_room_heating");
  });

  it("keeps unknown top-level keys", () => {
    const parsed = parseSchedule({ ...flo, something: { nested: [1, 2] } } as RawSchedule);
    expect(serialiseSchedule(parsed)).toHaveProperty("something", { nested: [1, 2] });
  });

  it("keeps blocks without data free of a data key", () => {
    const raw = [{ from: "00:00:00", to: "08:00:00" }];
    expect(serialiseBlocks(parseBlocks(raw))).toEqual(raw);
  });

  it("normalises the 23:59 ends Home Assistant helpers use", () => {
    const blocks = parseBlocks([
      { from: "00:00:00", to: "23:59:00", data: { target_temperature: 14 } },
    ]);
    expect(blocks).toEqual([{ start: 0, end: 1440, data: { target_temperature: 14 } }]);
    expect(serialiseBlocks(blocks)[0]?.to).toBe("24:00:00");
  });

  it("sorts blocks that arrive out of order", () => {
    const blocks = parseBlocks([
      { from: "08:00:00", to: "09:00:00" },
      { from: "00:00:00", to: "08:00:00" },
    ]);
    expect(blocks.map((b) => b.start)).toEqual([0, 480]);
  });

  it("does not share data objects with the raw input", () => {
    const parsed = parseSchedule(flo);
    const data = parsed.days.monday[0]?.data as Record<string, number>;
    data.target_temperature = 99;
    expect(flo.monday?.[0]?.data).toEqual({ target_temperature: 18 });
  });
});

describe("copyDay and withDay", () => {
  it("copies a day to others without touching the source or other days", () => {
    const parsed = parseSchedule(flo);
    const out = copyDay(parsed, "monday", ["wednesday", "thursday", "monday"]);
    expect(out.days.wednesday).toEqual(parsed.days.monday);
    expect(out.days.thursday).toEqual(parsed.days.monday);
    expect(out.days.tuesday).toEqual(parsed.days.tuesday);
    expect(out.days.wednesday[0]).not.toBe(parsed.days.monday[0]);
    expect(out.days.wednesday[0]?.data).not.toBe(parsed.days.monday[0]?.data);
  });

  it("replaces one day immutably", () => {
    const parsed = parseSchedule(flo);
    const out = withDay(parsed, "friday", [{ start: 0, end: 60 }]);
    expect(out.days.friday).toEqual([{ start: 0, end: 60 }]);
    expect(parsed.days.friday).toEqual([]);
  });
});
