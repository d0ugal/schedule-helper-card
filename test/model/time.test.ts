import { describe, expect, it } from "vitest";
import { clamp, formatTime, formatTimeHa, parseTime, snap } from "../../src/model";

describe("parseTime", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(parseTime("08:30")).toBe(510);
    expect(parseTime("08:30:00")).toBe(510);
    expect(parseTime("0:05")).toBe(5);
  });

  it("drops seconds and fractional seconds", () => {
    expect(parseTime("12:00:59")).toBe(720);
    expect(parseTime("12:00:00.500000")).toBe(720);
  });

  it("accepts 24:00 as the end of the day", () => {
    expect(parseTime("24:00:00", true)).toBe(1440);
    expect(parseTime("24:00")).toBe(1440);
  });

  it("treats an end of 23:59 or later as midnight", () => {
    expect(parseTime("23:59:00", true)).toBe(1440);
    expect(parseTime("23:59:59", true)).toBe(1440);
    expect(parseTime("23:59:59.999999", true)).toBe(1440);
  });

  it("keeps 23:59 as is for a start time", () => {
    expect(parseTime("23:59:00")).toBe(1439);
  });

  it.each(["", "8", "25:00", "24:30", "12:60", "ab:cd", "12:00:0"])("rejects %j", (bad) => {
    expect(() => parseTime(bad)).toThrow();
  });
});

describe("formatting", () => {
  it("formats minutes", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(1440)).toBe("24:00");
    expect(formatTime(1025)).toBe("17:05");
    expect(formatTimeHa(450)).toBe("07:30:00");
  });
});

describe("snap and clamp", () => {
  it("snaps to the nearest step", () => {
    expect(snap(722)).toBe(720);
    expect(snap(723)).toBe(725);
    expect(snap(37, 15)).toBe(30);
  });

  it("clamps", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
