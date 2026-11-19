import { describe, expect, it } from "vitest";
import "../src/schedule-helper-card";
import type { ScheduleHelperCard } from "../src/schedule-helper-card";

describe("schedule-helper-card", () => {
  it("registers the custom element", () => {
    expect(customElements.get("schedule-helper-card")).toBeDefined();
  });

  it("rejects a non-schedule entity", () => {
    const card = document.createElement("schedule-helper-card") as ScheduleHelperCard;
    expect(() => card.setConfig({ entity: "light.lamp" })).toThrow();
  });

  it("shows the schedule state", async () => {
    const card = document.createElement("schedule-helper-card") as ScheduleHelperCard;
    card.setConfig({ entity: "schedule.heating" });
    card.hass = { states: { "schedule.heating": { state: "on", attributes: {} } } };
    document.body.appendChild(card);
    await card.updateComplete;
    expect(card.shadowRoot?.textContent).toContain("on");
  });
});
