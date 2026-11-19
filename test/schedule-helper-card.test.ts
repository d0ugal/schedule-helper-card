import { afterEach, describe, expect, it } from "vitest";
import "../src/schedule-helper-card";
import type { ScheduleHelperCard } from "../src/schedule-helper-card";
import type { CardConfig, Hass } from "../src/types";

const H = 20; // pixels per hour in these tests
const y = (hours: number) => hours * H;

type Msg = Record<string, unknown>;

const FIELDS: CardConfig["fields"] = [
  { key: "target_temperature", label: "Temperature", unit: "°C", step: 0.5, min: 5, max: 30 },
  { key: "cold_bonus", label: "Cold bonus", unit: "°C", step: 0.5 },
];

function item() {
  return {
    id: "heating",
    name: "Heating",
    icon: "mdi:radiator",
    monday: [
      { from: "00:00:00", to: "08:00:00", data: { target_temperature: 18, note: "keep" } },
      { from: "08:00:00", to: "16:00:00", data: { target_temperature: 14 } },
      { from: "16:00:00", to: "24:00:00", data: { target_temperature: 18 } },
    ],
    tuesday: [{ from: "00:00:00", to: "24:00:00", data: { target_temperature: 14 } }],
  };
}

interface Mocks {
  hass: Hass;
  updates: Msg[];
}

function makeHass(options: { items?: unknown[]; failUpdate?: boolean; list?: Msg } = {}): Mocks {
  const updates: Msg[] = [];
  const items = options.items ?? [item()];
  const hass: Hass = {
    states: {
      "schedule.heating": {
        state: "on",
        last_updated: "t1",
        attributes: { editable: true, target_temperature: 18 },
      },
    },
    callWS: (async (m: Msg) => {
      if (m.type === "config/entity_registry/get") return { unique_id: "heating" };
      if (m.type === "schedule/list") return structuredClone(items);
      if (m.type === "schedule/update") {
        if (options.failUpdate) throw new Error("boom");
        updates.push(m);
        return {};
      }
      if (m.type === "call_service") {
        return {
          response: {
            "schedule.heating": {
              monday: [
                { from: "00:00:00", to: "23:59:59.999999", data: { target_temperature: 14 } },
              ],
            },
          },
        };
      }
      throw new Error(`unexpected ${String(m.type)}`);
    }) as Hass["callWS"],
  };
  return { hass, updates };
}

async function settle(card: ScheduleHelperCard): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
}

const mounted: ScheduleHelperCard[] = [];

async function mount(mocks: Mocks, config: Partial<CardConfig> = {}): Promise<ScheduleHelperCard> {
  const card = document.createElement("schedule-helper-card") as ScheduleHelperCard;
  card.setConfig({ entity: "schedule.heating", fields: FIELDS, hour_height: H, ...config });
  card.hass = mocks.hass;
  document.body.appendChild(card);
  mounted.push(card);
  await settle(card);
  card.shadowRoot?.querySelector<HTMLElement>('[data-day="monday"]')?.click();
  await settle(card);
  return card;
}

afterEach(() => {
  for (const card of mounted.splice(0)) card.remove();
});

const q = <T extends Element = HTMLElement>(card: ScheduleHelperCard, sel: string) =>
  card.shadowRoot?.querySelector<T>(sel) ?? null;
const qa = (card: ScheduleHelperCard, sel: string) => [
  ...(card.shadowRoot?.querySelectorAll<HTMLElement>(sel) ?? []),
];

function clickTrack(card: ScheduleHelperCard, clientY: number) {
  q(card, ".track")?.dispatchEvent(
    new MouseEvent("click", { bubbles: true, composed: true, clientY }),
  );
}

function pointer(el: Element | null, type: string, clientY: number, altKey = false) {
  el?.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      composed: true,
      pointerId: 1,
      clientY,
      button: 0,
      altKey,
    }),
  );
}

function windowKey(type: "keydown" | "keyup", k: string) {
  window.dispatchEvent(new KeyboardEvent(type, { key: k, altKey: type === "keydown" }));
}

function key(el: Element | null, k: string, init: KeyboardEventInit = {}) {
  el?.dispatchEvent(
    new KeyboardEvent("keydown", { key: k, bubbles: true, composed: true, ...init }),
  );
}

async function selectBlock(card: ScheduleHelperCard, index: number) {
  qa(card, ".block")[index]?.querySelector<HTMLElement>(".label")?.click();
  await settle(card);
}

function mondayOf(
  update: Msg | undefined,
): { from: string; to: string; data?: Record<string, unknown> }[] {
  return (update as { monday: never }).monday;
}

describe("setup", () => {
  it("registers the custom element and the card picker entry", () => {
    expect(customElements.get("schedule-helper-card")).toBeDefined();
    expect(window.customCards?.some((c) => c.type === "schedule-helper-card")).toBe(true);
  });

  it("rejects a non-schedule entity", () => {
    const card = document.createElement("schedule-helper-card") as ScheduleHelperCard;
    expect(() => card.setConfig({ entity: "light.lamp" })).toThrow();
  });
});

describe("rendering", () => {
  it("shows the seven day tabs and the blocks of the selected day", async () => {
    const card = await mount(makeHass());
    expect(qa(card, ".tab")).toHaveLength(7);
    expect(q(card, '[data-day="monday"]')?.getAttribute("aria-selected")).toBe("true");
    const blocks = qa(card, ".block");
    expect(blocks).toHaveLength(3);
    expect(blocks[1]?.textContent?.trim()).toBe("14°");
    expect(blocks[1]?.getAttribute("style")).toContain(`top:${y(8)}px`);
    expect(blocks[1]?.getAttribute("style")).toContain(`height:${y(8)}px`);
  });

  it("shows the state and the current value", async () => {
    const card = await mount(makeHass());
    expect(q(card, ".pill")?.textContent?.trim()).toBe("on · 18°");
  });

  it("switches day", async () => {
    const card = await mount(makeHass());
    q(card, '[data-day="tuesday"]')?.click();
    await settle(card);
    expect(qa(card, ".block")).toHaveLength(1);
  });

  it("shows handles and the chip for a selected block", async () => {
    const card = await mount(makeHass());
    expect(qa(card, ".handle")).toHaveLength(0);
    await selectBlock(card, 1);
    expect(qa(card, ".handle")).toHaveLength(2);
    expect(q(card, ".chip")?.textContent?.replace(/\s+/g, " ").trim()).toBe("14° · 08:00 → 16:00");
    expect(q(card, '.handle[data-edge="end"]')?.getAttribute("aria-valuetext")).toBe("16:00");
  });
});

describe("creating a block", () => {
  it("opens a number box on click, and Enter creates a one hour block that splits the old one", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    clickTrack(card, y(12));
    await settle(card);
    const input = q<HTMLInputElement>(card, ".pop input");
    expect(input).not.toBeNull();
    expect(q(card, ".pop small")?.textContent).toContain("12:00");
    (input as HTMLInputElement).value = "19";
    key(input, "Enter");
    await settle(card);

    expect(mocks.updates).toHaveLength(1);
    const update = mocks.updates[0] as Msg;
    expect(update.type).toBe("schedule/update");
    expect(update.schedule_id).toBe("heating");
    expect(update.name).toBe("Heating");
    expect(update.icon).toBe("mdi:radiator");
    expect(mondayOf(update)).toEqual([
      { from: "00:00:00", to: "08:00:00", data: { target_temperature: 18, note: "keep" } },
      { from: "08:00:00", to: "12:00:00", data: { target_temperature: 14 } },
      { from: "12:00:00", to: "13:00:00", data: { target_temperature: 19 } },
      { from: "13:00:00", to: "16:00:00", data: { target_temperature: 14 } },
      { from: "16:00:00", to: "24:00:00", data: { target_temperature: 18 } },
    ]);
    expect(update.tuesday).toEqual(item().tuesday);
    expect(update.wednesday).toEqual([]);
    expect(qa(card, ".handle")).toHaveLength(2);
    expect(q(card, ".chip")?.textContent?.replace(/\s+/g, " ").trim()).toBe("19° · 12:00 → 13:00");
  });

  it("clamps to the field limits and ignores empty input", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    clickTrack(card, y(12));
    await settle(card);
    const input = q<HTMLInputElement>(card, ".pop input") as HTMLInputElement;
    input.value = "";
    key(input, "Enter");
    await settle(card);
    expect(mocks.updates).toHaveLength(0);
    input.value = "99";
    key(input, "Enter");
    await settle(card);
    expect(mondayOf(mocks.updates[0]).find((b) => b.from === "12:00:00")?.data).toEqual({
      target_temperature: 30,
    });
  });

  it("cancels with Escape", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    clickTrack(card, y(12));
    await settle(card);
    key(q(card, ".pop input"), "Escape");
    await settle(card);
    expect(q(card, ".pop")).toBeNull();
    expect(mocks.updates).toHaveLength(0);
  });

  it("does not open when a label is clicked", async () => {
    const card = await mount(makeHass());
    await selectBlock(card, 0);
    expect(q(card, ".pop")).toBeNull();
  });
});

describe("dragging", () => {
  async function dragSetup() {
    const mocks = makeHass();
    const card = await mount(mocks);
    await selectBlock(card, 0);
    // Make a 12-13 block first so the mock scenario matches.
    clickTrack(card, y(12));
    await settle(card);
    const input = q<HTMLInputElement>(card, ".pop input") as HTMLInputElement;
    input.value = "19";
    key(input, "Enter");
    await settle(card);
    mocks.updates.length = 0;
    return { mocks, card };
  }

  it("pushes the neighbour while dragging the end edge, and saves on release", async () => {
    const { mocks, card } = await dragSetup();
    const end = q(card, '.handle[data-edge="end"]');
    pointer(end, "pointerdown", y(13));
    pointer(end, "pointermove", y(15));
    await settle(card);
    expect(q(card, ".chip")?.textContent?.replace(/\s+/g, " ").trim()).toBe("19° · 12:00 → 15:00");
    expect(q(card, ".note.pushed")?.textContent?.trim()).toBe("14° pushed to 15:00");
    expect(mocks.updates).toHaveLength(0);
    pointer(end, "pointerup", y(15));
    await settle(card);
    expect(mocks.updates).toHaveLength(1);
    expect(mondayOf(mocks.updates[0]).map((b) => [b.from, b.to])).toEqual([
      ["00:00:00", "08:00:00"],
      ["08:00:00", "12:00:00"],
      ["12:00:00", "15:00:00"],
      ["15:00:00", "16:00:00"],
      ["16:00:00", "24:00:00"],
    ]);
  });

  it("replaces a covered neighbour and pushes the next one", async () => {
    const { mocks, card } = await dragSetup();
    const end = q(card, '.handle[data-edge="end"]');
    pointer(end, "pointerdown", y(13));
    pointer(end, "pointermove", y(17));
    await settle(card);
    expect(q(card, ".note.replaced")?.textContent?.trim()).toBe("14° replaced");
    expect(q(card, ".note.pushed")?.textContent?.trim()).toBe("18° pushed to 17:00");
    expect(q(card, ".ghost")).not.toBeNull();
    pointer(end, "pointerup", y(17));
    await settle(card);
    expect(
      mondayOf(mocks.updates[0]).map((b) => [b.from, b.to, b.data?.target_temperature]),
    ).toEqual([
      ["00:00:00", "08:00:00", 18],
      ["08:00:00", "12:00:00", 14],
      ["12:00:00", "17:00:00", 19],
      ["17:00:00", "24:00:00", 18],
    ]);
  });

  it("works on the start edge", async () => {
    const { mocks, card } = await dragSetup();
    const start = q(card, '.handle[data-edge="start"]');
    pointer(start, "pointerdown", y(12));
    pointer(start, "pointermove", y(10));
    pointer(start, "pointerup", y(10));
    await settle(card);
    expect(mondayOf(mocks.updates[0]).map((b) => [b.from, b.to])).toContainEqual([
      "10:00:00",
      "13:00:00",
    ]);
    expect(mondayOf(mocks.updates[0]).map((b) => [b.from, b.to])).toContainEqual([
      "08:00:00",
      "10:00:00",
    ]);
  });

  it("pulls the touching neighbour along when the end is dragged away", async () => {
    const { mocks, card } = await dragSetup();
    const end = q(card, '.handle[data-edge="end"]');
    pointer(end, "pointerdown", y(13));
    pointer(end, "pointermove", y(12.5));
    await settle(card);
    expect(q(card, ".chip")?.textContent?.replace(/\s+/g, " ").trim()).toBe("19° · 12:00 → 12:30");
    expect(q(card, ".note.followed")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "14° follows to 12:30",
    );
    expect(q(card, ".note.pushed")).toBeNull();
    pointer(end, "pointerup", y(12.5));
    await settle(card);
    expect(mocks.updates).toHaveLength(1);
    expect(mondayOf(mocks.updates[0]).map((b) => [b.from, b.to])).toEqual([
      ["00:00:00", "08:00:00"],
      ["08:00:00", "12:00:00"],
      ["12:00:00", "12:30:00"],
      ["12:30:00", "16:00:00"],
      ["16:00:00", "24:00:00"],
    ]);
  });

  it("pulls the previous neighbour along when the start is dragged away", async () => {
    const { mocks, card } = await dragSetup();
    const start = q(card, '.handle[data-edge="start"]');
    pointer(start, "pointerdown", y(12));
    pointer(start, "pointermove", y(12.5));
    await settle(card);
    expect(q(card, ".note.followed")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "14° follows to 12:30",
    );
    pointer(start, "pointerup", y(12.5));
    await settle(card);
    expect(mondayOf(mocks.updates[0]).map((b) => [b.from, b.to])).toEqual([
      ["00:00:00", "08:00:00"],
      ["08:00:00", "12:30:00"],
      ["12:30:00", "13:00:00"],
      ["13:00:00", "16:00:00"],
      ["16:00:00", "24:00:00"],
    ]);
  });

  it("leaves a gap while Alt is held", async () => {
    const { mocks, card } = await dragSetup();
    const end = q(card, '.handle[data-edge="end"]');
    pointer(end, "pointerdown", y(13), true);
    pointer(end, "pointermove", y(12.5), true);
    await settle(card);
    expect(q(card, ".note")).toBeNull();
    pointer(end, "pointerup", y(12.5), true);
    await settle(card);
    expect(mondayOf(mocks.updates[0]).map((b) => [b.from, b.to])).toEqual([
      ["00:00:00", "08:00:00"],
      ["08:00:00", "12:00:00"],
      ["12:00:00", "12:30:00"],
      ["13:00:00", "16:00:00"],
      ["16:00:00", "24:00:00"],
    ]);
  });

  it("switches between following and leaving a gap when Alt is pressed and released mid-drag", async () => {
    const { mocks, card } = await dragSetup();
    const end = q(card, '.handle[data-edge="end"]');
    pointer(end, "pointerdown", y(13));
    pointer(end, "pointermove", y(12.5));
    await settle(card);
    expect(q(card, ".note.followed")).not.toBeNull();
    windowKey("keydown", "Alt");
    await settle(card);
    expect(q(card, ".note")).toBeNull();
    windowKey("keyup", "Alt");
    await settle(card);
    expect(q(card, ".note.followed")).not.toBeNull();
    windowKey("keydown", "Alt");
    await settle(card);
    pointer(end, "pointerup", y(12.5), true);
    await settle(card);
    expect(mondayOf(mocks.updates[0]).map((b) => b.from)).toContain("13:00:00");
  });

  it("still pushes the neighbour when Alt is held and the edge moves into it", async () => {
    const { mocks, card } = await dragSetup();
    const end = q(card, '.handle[data-edge="end"]');
    pointer(end, "pointerdown", y(13), true);
    pointer(end, "pointermove", y(15), true);
    await settle(card);
    expect(q(card, ".note.pushed")?.textContent?.trim()).toBe("14° pushed to 15:00");
    pointer(end, "pointerup", y(15), true);
    await settle(card);
    expect(mondayOf(mocks.updates[0]).map((b) => [b.from, b.to])).toContainEqual([
      "15:00:00",
      "16:00:00",
    ]);
  });

  it("leaves a gap where the edge was not touching a neighbour", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    // Delete the middle block to make a gap, then drag the end of the first block away.
    await selectBlock(card, 1);
    q(card, "button.danger")?.click();
    await settle(card);
    mocks.updates.length = 0;
    await selectBlock(card, 0);
    const end = q(card, '.handle[data-edge="end"]');
    pointer(end, "pointerdown", y(8));
    pointer(end, "pointermove", y(6));
    await settle(card);
    expect(q(card, ".note")).toBeNull();
    pointer(end, "pointerup", y(6));
    await settle(card);
    expect(mondayOf(mocks.updates[0]).map((b) => [b.from, b.to])).toEqual([
      ["00:00:00", "06:00:00"],
      ["16:00:00", "24:00:00"],
    ]);
  });

  it("snaps to five minutes", async () => {
    const { mocks, card } = await dragSetup();
    const end = q(card, '.handle[data-edge="end"]');
    pointer(end, "pointerdown", y(13));
    pointer(end, "pointermove", y(13) + 4.4); // about 13 minutes past
    pointer(end, "pointerup", y(13) + 4.4);
    await settle(card);
    expect(mondayOf(mocks.updates[0]).map((b) => b.to)).toContain("13:15:00");
  });

  it("undoes the drag with Escape and saves nothing", async () => {
    const { mocks, card } = await dragSetup();
    const end = q(card, '.handle[data-edge="end"]');
    pointer(end, "pointerdown", y(13));
    pointer(end, "pointermove", y(17));
    await settle(card);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle(card);
    pointer(end, "pointerup", y(17));
    await settle(card);
    expect(mocks.updates).toHaveLength(0);
    expect(qa(card, ".block")).toHaveLength(5);
    expect(q(card, ".note")).toBeNull();
  });

  it("nudges an edge by five minutes with the arrow keys", async () => {
    const { mocks, card } = await dragSetup();
    const end = q(card, '.handle[data-edge="end"]');
    key(end, "ArrowDown");
    await settle(card);
    expect(mondayOf(mocks.updates.at(-1))).toContainEqual({
      from: "12:00:00",
      to: "13:05:00",
      data: { target_temperature: 19 },
    });
    key(q(card, '.handle[data-edge="end"]'), "ArrowUp", { shiftKey: true });
    await settle(card);
    expect(mondayOf(mocks.updates.at(-1)).find((b) => b.from === "12:00:00")?.to).toBe("12:05:00");
  });

  it("pulls the neighbour along when an arrow key shrinks a block, and Alt leaves a gap", async () => {
    const { mocks, card } = await dragSetup();
    key(q(card, '.handle[data-edge="end"]'), "ArrowUp");
    await settle(card);
    expect(mondayOf(mocks.updates.at(-1)).map((b) => [b.from, b.to])).toContainEqual([
      "12:55:00",
      "16:00:00",
    ]);
    key(q(card, '.handle[data-edge="end"]'), "ArrowUp", { altKey: true });
    await settle(card);
    const after = mondayOf(mocks.updates.at(-1)).map((b) => [b.from, b.to]);
    expect(after).toContainEqual(["12:00:00", "12:50:00"]);
    expect(after).toContainEqual(["12:55:00", "16:00:00"]);
  });

  it("exposes the edges to assistive tech", async () => {
    const { card } = await dragSetup();
    const start = q(card, '.handle[data-edge="start"]');
    expect(start?.getAttribute("role")).toBe("slider");
    expect(start?.getAttribute("tabindex")).toBe("0");
    expect(start?.getAttribute("aria-valuetext")).toBe("12:00");
  });
});

describe("editing a block", () => {
  it("edits a field and keeps data keys that are not configured", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    await selectBlock(card, 0);
    const input = q<HTMLInputElement>(card, "#f-cold_bonus") as HTMLInputElement;
    input.value = "1.5";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(card);
    expect(mondayOf(mocks.updates[0])[0]?.data).toEqual({
      target_temperature: 18,
      note: "keep",
      cold_bonus: 1.5,
    });
  });

  it("removes an optional field when it is cleared", async () => {
    const data = item();
    (data.monday[0] as { data: Record<string, unknown> }).data.cold_bonus = 1.5;
    const mocks = makeHass({ items: [data] });
    const card = await mount(mocks);
    await selectBlock(card, 0);
    const input = q<HTMLInputElement>(card, "#f-cold_bonus") as HTMLInputElement;
    expect(input.value).toBe("1.5");
    input.value = "";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(card);
    expect(mondayOf(mocks.updates[0])[0]?.data).toEqual({ target_temperature: 18, note: "keep" });
  });

  it("clamps the primary value to its limits", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    await selectBlock(card, 1);
    const input = q<HTMLInputElement>(card, "#f-target_temperature") as HTMLInputElement;
    input.value = "2";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(card);
    expect(mondayOf(mocks.updates[0])[1]?.data).toEqual({ target_temperature: 5 });
  });

  it("deletes a block and leaves a gap", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    await selectBlock(card, 1);
    qa(card, "button.danger")[0]?.click();
    await settle(card);
    expect(mondayOf(mocks.updates[0]).map((b) => b.from)).toEqual(["00:00:00", "16:00:00"]);
    expect(qa(card, ".handle")).toHaveLength(0);
  });
});

describe("copying a day", () => {
  it("asks first, then copies Monday to the weekdays", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    q(card, '[data-copy="weekdays"]')?.click();
    await settle(card);
    expect(card.shadowRoot?.textContent).toContain("replacing what is there");
    expect(mocks.updates).toHaveLength(0);
    qa(card, "button.primary")[0]?.click();
    await settle(card);
    const update = mocks.updates[0] as Msg & Record<string, unknown[]>;
    for (const day of ["tuesday", "wednesday", "thursday", "friday"]) {
      expect(update[day]).toEqual(update.monday);
    }
    expect(update.saturday).toEqual([]);
  });

  it("can be cancelled and can copy to all days", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    q(card, '[data-copy="weekdays"]')?.click();
    await settle(card);
    qa(card, "button.btn")
      .find((b) => b.textContent?.trim() === "Cancel")
      ?.click();
    await settle(card);
    expect(mocks.updates).toHaveLength(0);
    q(card, '[data-copy="all"]')?.click();
    await settle(card);
    qa(card, "button.primary")[0]?.click();
    await settle(card);
    const update = mocks.updates[0] as Msg & Record<string, unknown[]>;
    expect(update.sunday).toEqual(update.monday);
  });
});

describe("copying a day to chosen days", () => {
  const chip = (card: ScheduleHelperCard, day: string) =>
    q<HTMLButtonElement>(card, `.daychip[data-target="${day}"]`) as HTMLButtonElement;
  const copyButton = (card: ScheduleHelperCard) =>
    q<HTMLButtonElement>(card, 'button[data-copy="selected"]') as HTMLButtonElement;
  const confirmText = (card: ScheduleHelperCard) =>
    q(card, "[data-confirm]")?.textContent?.replace(/\s+/g, " ").trim();
  const confirm = (card: ScheduleHelperCard) =>
    qa(card, "[data-confirm] button")
      .find((b) => b.textContent?.trim() === "Copy")
      ?.click();

  it("shows seven day chips with the source day disabled and Copy disabled until one is picked", async () => {
    const card = await mount(makeHass());
    expect(qa(card, ".daychip").map((b) => b.textContent?.trim())).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(chip(card, "monday").disabled).toBe(true);
    expect(chip(card, "tuesday").disabled).toBe(false);
    expect(copyButton(card).disabled).toBe(true);
    // The Weekdays and All days shortcuts are still there.
    expect(q(card, '[data-copy="weekdays"]')).not.toBeNull();
    expect(q(card, '[data-copy="all"]')).not.toBeNull();
  });

  it("toggles chips on and off, and ignores the source day", async () => {
    const card = await mount(makeHass());
    chip(card, "wednesday").click();
    chip(card, "friday").click();
    chip(card, "monday").click();
    await settle(card);
    const pressed = () =>
      qa(card, '.daychip[aria-pressed="true"]').map((b) => b.dataset.target as string);
    expect(pressed()).toEqual(["wednesday", "friday"]);
    expect(copyButton(card).disabled).toBe(false);
    chip(card, "wednesday").click();
    await settle(card);
    expect(pressed()).toEqual(["friday"]);
    chip(card, "friday").click();
    await settle(card);
    expect(pressed()).toEqual([]);
    expect(copyButton(card).disabled).toBe(true);
  });

  it("names the chosen days in the confirm step and copies only to them", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    chip(card, "friday").click();
    chip(card, "wednesday").click();
    await settle(card);
    copyButton(card).click();
    await settle(card);
    expect(confirmText(card)).toContain(
      "Copy Mon to Wed and Fri, replacing what is there on those days?",
    );
    expect(mocks.updates).toHaveLength(0);
    confirm(card);
    await settle(card);
    const update = mocks.updates[0] as Msg & Record<string, unknown[]>;
    expect(update.wednesday).toEqual(update.monday);
    expect(update.friday).toEqual(update.monday);
    expect(update.thursday).toEqual([]);
    expect(update.tuesday).toHaveLength(1); // untouched, it was not chosen
    expect(update.monday).toHaveLength(3);
    // The picks are cleared after a copy.
    expect(qa(card, '.daychip[aria-pressed="true"]')).toHaveLength(0);
  });

  it("copies to a single specific day", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    chip(card, "thursday").click();
    await settle(card);
    copyButton(card).click();
    await settle(card);
    expect(confirmText(card)).toContain("Copy Mon to Thu, replacing what is there on that day?");
    confirm(card);
    await settle(card);
    const update = mocks.updates[0] as Msg & Record<string, unknown[]>;
    expect(update.thursday).toEqual(update.monday);
    expect(update.tuesday).toHaveLength(1);
    expect(update.wednesday).toEqual([]);
  });

  it("replaces a day that already has blocks", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    chip(card, "tuesday").click();
    await settle(card);
    copyButton(card).click();
    await settle(card);
    confirm(card);
    await settle(card);
    const update = mocks.updates[0] as Msg & Record<string, unknown[]>;
    expect(update.tuesday).toEqual(update.monday);
    expect(update.tuesday).toHaveLength(3);
  });

  it("keeps the picks when the confirm step is cancelled", async () => {
    const mocks = makeHass();
    const card = await mount(mocks);
    chip(card, "saturday").click();
    await settle(card);
    copyButton(card).click();
    await settle(card);
    qa(card, "[data-confirm] button")
      .find((b) => b.textContent?.trim() === "Cancel")
      ?.click();
    await settle(card);
    expect(mocks.updates).toHaveLength(0);
    expect(chip(card, "saturday").getAttribute("aria-pressed")).toBe("true");
  });

  it("cancels the confirm step with Escape", async () => {
    const card = await mount(makeHass());
    chip(card, "saturday").click();
    await settle(card);
    copyButton(card).click();
    await settle(card);
    expect(q(card, "[data-confirm]")).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle(card);
    expect(q(card, "[data-confirm]")).toBeNull();
  });

  it("names the days for the Weekdays and All days shortcuts too", async () => {
    const card = await mount(makeHass());
    q(card, '[data-copy="weekdays"]')?.click();
    await settle(card);
    expect(confirmText(card)).toContain("Copy Mon to Tue, Wed, Thu and Fri, replacing");
    qa(card, "[data-confirm] button")
      .find((b) => b.textContent?.trim() === "Cancel")
      ?.click();
    await settle(card);
    q(card, '[data-copy="all"]')?.click();
    await settle(card);
    expect(confirmText(card)).toContain("Copy Mon to Tue, Wed, Thu, Fri, Sat and Sun, replacing");
  });

  it("clears the picks and disables the new source day when the day changes", async () => {
    const card = await mount(makeHass());
    chip(card, "wednesday").click();
    await settle(card);
    card.shadowRoot?.querySelector<HTMLElement>('[data-day="tuesday"]')?.click();
    await settle(card);
    expect(qa(card, '.daychip[aria-pressed="true"]')).toHaveLength(0);
    expect(chip(card, "tuesday").disabled).toBe(true);
    expect(chip(card, "monday").disabled).toBe(false);
    expect(q(card, ".copy")?.textContent).toContain("Copy Tue to");
  });
});

describe("read only and errors", () => {
  it("is read only for a helper that is not stored in the UI", async () => {
    const mocks = makeHass({ items: [] });
    const card = await mount(mocks);
    expect(qa(card, ".block")).toHaveLength(1);
    clickTrack(card, y(12));
    await settle(card);
    expect(q(card, ".pop")).toBeNull();
    expect(card.shadowRoot?.textContent).toContain("read only");
    expect(q(card, "[data-copy]")).toBeNull();
    expect(mocks.updates).toHaveLength(0);
  });

  it("shows an error and reloads when saving fails", async () => {
    const mocks = makeHass({ failUpdate: true });
    const card = await mount(mocks);
    clickTrack(card, y(12));
    await settle(card);
    const input = q<HTMLInputElement>(card, ".pop input") as HTMLInputElement;
    input.value = "19";
    key(input, "Enter");
    await settle(card);
    expect(q(card, ".status")?.textContent).toContain("Could not save: boom");
    expect(qa(card, ".block")).toHaveLength(3);
  });

  it("reloads when the entity changes elsewhere", async () => {
    const data = item();
    const mocks = makeHass({ items: [data] });
    const card = await mount(mocks);
    expect(qa(card, ".block")).toHaveLength(3);
    data.monday.pop();
    mocks.hass.callWS = (async (m: Msg) => {
      if (m.type === "config/entity_registry/get") return { unique_id: "heating" };
      return [structuredClone(data)];
    }) as Hass["callWS"];
    card.hass = {
      ...mocks.hass,
      states: { "schedule.heating": { state: "on", last_updated: "t2", attributes: {} } },
    };
    await settle(card);
    expect(qa(card, ".block")).toHaveLength(2);
  });
});
