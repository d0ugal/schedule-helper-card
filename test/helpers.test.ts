import { describe, expect, it } from "vitest";
import { loadSchedule, saveSchedule } from "../src/api";
import { colorFor, rangeOf } from "../src/color";
import { stackTops } from "../src/layout";
import { parseSchedule } from "../src/model";
import type { Hass } from "../src/types";

describe("stackTops", () => {
  it("keeps items that already clear each other", () => {
    expect(stackTops([0, 30, 60])).toEqual([0, 30, 60]);
  });

  it("pushes overlapping items down, preserving order of the input", () => {
    expect(stackTops([100, 90, 95], 22)).toEqual([134, 90, 112]);
  });

  it("handles an empty list", () => {
    expect(stackTops([])).toEqual([]);
  });
});

describe("colour", () => {
  it("goes from blue through amber to orange across the range", () => {
    const range = { min: 10, max: 20 };
    expect(colorFor(10, range)).toBe("#5aa7e6");
    expect(colorFor(15, range)).toBe("#ffb454");
    expect(colorFor(20, range)).toBe("#ff7a45");
    expect(colorFor(5, range)).toBe(colorFor(10, range));
    expect(colorFor(12, range)).toContain("color-mix(in oklab, #ffb454 40%, #5aa7e6)");
    expect(colorFor(18, range)).toContain("color-mix(in oklab, #ff7a45 60%, #ffb454)");
    expect(colorFor(undefined, range)).toContain("--shc-neutral");
  });

  it("widens a narrow range so values still differ", () => {
    expect(rangeOf([14, 14])).toEqual({ min: 12, max: 16 });
    expect(rangeOf([13, 20])).toEqual({ min: 13, max: 20 });
    expect(rangeOf([])).toEqual({ min: 0, max: 1 });
  });
});

describe("api", () => {
  function hassWith(handlers: Record<string, (m: Record<string, unknown>) => unknown>): {
    hass: Hass;
    calls: Record<string, unknown>[];
  } {
    const calls: Record<string, unknown>[] = [];
    const hass = {
      states: { "schedule.heating": { state: "on", attributes: { friendly_name: "Heating" } } },
      callWS: async (m: Record<string, unknown>) => {
        calls.push(m);
        const handler = handlers[String(m.type)];
        if (!handler) throw new Error("no handler");
        return handler(m);
      },
    } as Hass;
    return { hass, calls };
  }

  it("uses the registry unique id to find the helper", async () => {
    const { hass } = hassWith({
      "config/entity_registry/get": () => ({ unique_id: "abc" }),
      "schedule/list": () => [{ id: "abc", name: "Renamed", monday: [] }],
    });
    const out = await loadSchedule(hass, "schedule.heating");
    expect(out.editable).toBe(true);
    expect(out.schedule.name).toBe("Renamed");
  });

  it("falls back to the entity id when the registry is not readable", async () => {
    const { hass } = hassWith({
      "schedule/list": () => [{ id: "heating", name: "H" }],
    });
    expect((await loadSchedule(hass, "schedule.heating")).schedule.id).toBe("heating");
  });

  it("falls back to the read only service for non stored helpers", async () => {
    const { hass } = hassWith({
      "schedule/list": () => [],
      call_service: () => ({
        response: {
          "schedule.heating": {
            monday: [{ from: "00:00:00", to: "23:59:59.999999" }],
          },
        },
      }),
    });
    const out = await loadSchedule(hass, "schedule.heating");
    expect(out.editable).toBe(false);
    expect(out.schedule.days.monday).toEqual([{ start: 0, end: 1440 }]);
    expect(out.schedule.name).toBe("Heating");
  });

  it("saves with the update command and the helper id", async () => {
    const { hass, calls } = hassWith({ "schedule/update": () => ({}) });
    await saveSchedule(
      hass,
      "schedule.heating",
      parseSchedule({ id: "abc", name: "H", icon: "mdi:x" }),
    );
    expect(calls[0]).toMatchObject({
      type: "schedule/update",
      schedule_id: "abc",
      name: "H",
      icon: "mdi:x",
    });
    expect(calls[0]).not.toHaveProperty("id");
  });
});
