import { describe, expect, it } from "vitest";
import {
  DAYS,
  type RawSchedule,
  copyDay,
  copyTargets,
  parseBlocks,
  parseSchedule,
  serialiseBlocks,
  serialiseSchedule,
  withDay,
} from "../../src/model";

/** Trimmed from the live Bedroom Heating helper (`schedule/list`). */
const bedroom: RawSchedule = {
  id: "bedroom_heating",
  name: "Bedroom Heating",
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
    const parsed = parseSchedule(bedroom);
    const out = serialiseSchedule(parsed);
    expect(out.monday).toEqual(bedroom.monday);
    expect(out.tuesday).toEqual(bedroom.tuesday);
    expect(out.name).toBe("Bedroom Heating");
    expect(out.icon).toBe("mdi:radiator");
  });

  it("fills missing days with empty lists", () => {
    const out = serialiseSchedule(parseSchedule(bedroom));
    expect(out.wednesday).toEqual([]);
    expect(out.sunday).toEqual([]);
  });

  it("sends the icon back, because the update replaces the whole item", () => {
    expect(serialiseSchedule(parseSchedule(bedroom))).toHaveProperty("icon", "mdi:radiator");
  });

  it("omits the icon when there was none", () => {
    const out = serialiseSchedule(parseSchedule({ name: "x" }));
    expect(out).not.toHaveProperty("icon");
  });

  it("does not include the id in the payload", () => {
    expect(serialiseSchedule(parseSchedule(bedroom))).not.toHaveProperty("id");
    expect(parseSchedule(bedroom).id).toBe("bedroom_heating");
  });

  it("keeps unknown top-level keys", () => {
    const parsed = parseSchedule({ ...bedroom, something: { nested: [1, 2] } } as RawSchedule);
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
    const parsed = parseSchedule(bedroom);
    const data = parsed.days.monday[0]?.data as Record<string, number>;
    data.target_temperature = 99;
    expect(bedroom.monday?.[0]?.data).toEqual({ target_temperature: 18 });
  });
});

describe("copyDay and withDay", () => {
  it("copies a day to others without touching the source or other days", () => {
    const parsed = parseSchedule(bedroom);
    const out = copyDay(parsed, "monday", ["wednesday", "thursday", "monday"]);
    expect(out.days.wednesday).toEqual(parsed.days.monday);
    expect(out.days.thursday).toEqual(parsed.days.monday);
    expect(out.days.tuesday).toEqual(parsed.days.tuesday);
    expect(out.days.wednesday[0]).not.toBe(parsed.days.monday[0]);
    expect(out.days.wednesday[0]?.data).not.toBe(parsed.days.monday[0]?.data);
  });

  it("copies to a single chosen day and leaves every other day alone", () => {
    const parsed = parseSchedule(bedroom);
    const out = copyDay(parsed, "monday", ["thursday"]);
    expect(out.days.thursday).toEqual(parsed.days.monday);
    for (const day of DAYS.filter((d) => d !== "thursday")) {
      expect(out.days[day]).toEqual(parsed.days[day]);
    }
  });

  it("copies to several chosen days, in any order and with duplicates", () => {
    const parsed = parseSchedule(bedroom);
    const out = copyDay(parsed, "monday", ["sunday", "wednesday", "sunday"]);
    expect(out.days.wednesday).toEqual(parsed.days.monday);
    expect(out.days.sunday).toEqual(parsed.days.monday);
    expect(out.days.thursday).toEqual([]);
  });

  it("never copies the source onto itself", () => {
    const parsed = parseSchedule(bedroom);
    const out = copyDay(parsed, "monday", ["monday", "friday"]);
    expect(out.days.monday).toBe(parsed.days.monday);
    expect(out.days.friday).toEqual(parsed.days.monday);
    expect(copyDay(parsed, "monday", ["monday"])).toBe(parsed);
  });

  it("does nothing for an empty selection", () => {
    const parsed = parseSchedule(bedroom);
    expect(copyDay(parsed, "monday", [])).toBe(parsed);
    expect(copyDay(parsed, "monday", new Set())).toBe(parsed);
  });

  it("replaces a target that was empty and one that already had blocks", () => {
    const parsed = parseSchedule(bedroom);
    expect(parsed.days.saturday).toEqual([]);
    expect(parsed.days.tuesday).toHaveLength(1);
    const out = copyDay(parsed, "monday", ["saturday", "tuesday"]);
    expect(out.days.saturday).toEqual(parsed.days.monday);
    expect(out.days.tuesday).toEqual(parsed.days.monday);
    expect(out.days.tuesday).toHaveLength(5);
  });

  it("keeps data keys the card does not know about", () => {
    const withNote = parseSchedule({
      name: "Heating",
      monday: [{ from: "00:00:00", to: "12:00:00", data: { target_temperature: 18, note: "x" } }],
    });
    const out = copyDay(withNote, "monday", ["friday"]);
    expect(out.days.friday[0]?.data).toEqual({ target_temperature: 18, note: "x" });
    expect(serialiseSchedule(out).friday).toEqual([
      { from: "00:00:00", to: "12:00:00", data: { target_temperature: 18, note: "x" } },
    ]);
  });

  it("deep copies, so editing a copy never changes the source", () => {
    const parsed = parseSchedule(bedroom);
    const before = JSON.stringify(parsed);
    const out = copyDay(parsed, "monday", ["friday"]);
    const copy = out.days.friday[0];
    if (copy) {
      copy.end = 1;
      if (copy.data) copy.data.target_temperature = 99;
    }
    expect(JSON.stringify(parsed)).toBe(before);
  });

  it("works on a frozen schedule, so the source is never written to", () => {
    const parsed = parseSchedule(bedroom);
    const freeze = (value: unknown): void => {
      if (value && typeof value === "object") {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
      }
    };
    freeze(parsed);
    expect(() => copyDay(parsed, "monday", ["wednesday"])).not.toThrow();
  });

  it("lists the days a copy would change, in week order", () => {
    expect(copyTargets("monday", ["sunday", "monday", "wednesday", "wednesday"])).toEqual([
      "wednesday",
      "sunday",
    ]);
    expect(copyTargets("monday", [])).toEqual([]);
  });

  it("replaces one day immutably", () => {
    const parsed = parseSchedule(bedroom);
    const out = withDay(parsed, "friday", [{ start: 0, end: 60 }]);
    expect(out.days.friday).toEqual([{ start: 0, end: 60 }]);
    expect(parsed.days.friday).toEqual([]);
  });
});
