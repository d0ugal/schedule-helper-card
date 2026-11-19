import { type Block, type BlockData, cloneBlock, normalise } from "./blocks";
import { formatTimeHa, parseTime } from "./time";

export const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type DayName = (typeof DAYS)[number];

export const DAY_LABELS: Record<DayName, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export const WEEKDAYS: readonly DayName[] = DAYS.slice(0, 5);

/** A block as Home Assistant stores it (the `schedule/list` and `schedule/update` shape). */
export interface RawBlock {
  from: string;
  to: string;
  data?: BlockData;
}

/** A schedule helper item as returned by `schedule/list`. */
export type RawSchedule = {
  id?: string;
  name: string;
  icon?: string;
} & Partial<Record<DayName, RawBlock[]>>;

export interface Schedule {
  id?: string;
  name: string;
  icon?: string;
  days: Record<DayName, Block[]>;
  /** Any other keys on the stored item, kept so they survive a round trip. */
  extra: Record<string, unknown>;
}

const KNOWN_KEYS = new Set<string>(["id", "name", "icon", ...DAYS]);

export function parseBlocks(raw: readonly RawBlock[] | undefined): Block[] {
  return normalise(
    (raw ?? []).map((b) =>
      b.data === undefined
        ? { start: parseTime(b.from), end: parseTime(b.to, true) }
        : { start: parseTime(b.from), end: parseTime(b.to, true), data: structuredClone(b.data) },
    ),
  );
}

export function serialiseBlocks(blocks: readonly Block[]): RawBlock[] {
  return blocks.map((b) => {
    const out: RawBlock = { from: formatTimeHa(b.start), to: formatTimeHa(b.end) };
    if (b.data !== undefined) out.data = structuredClone(b.data);
    return out;
  });
}

export function parseSchedule(raw: RawSchedule): Schedule {
  const days = {} as Record<DayName, Block[]>;
  for (const day of DAYS) days[day] = parseBlocks(raw[day]);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_KEYS.has(key)) extra[key] = structuredClone(value);
  }
  const schedule: Schedule = { name: raw.name, days, extra };
  if (raw.id !== undefined) schedule.id = raw.id;
  if (raw.icon !== undefined) schedule.icon = raw.icon;
  return schedule;
}

/**
 * Build the `schedule/update` payload (without `type` and `schedule_id`). The update
 * replaces the whole item, so the name and icon must be sent back or they are lost.
 */
export function serialiseSchedule(schedule: Schedule): Omit<RawSchedule, "id"> {
  const out: Record<string, unknown> = { name: schedule.name };
  if (schedule.icon !== undefined) out.icon = schedule.icon;
  for (const [key, value] of Object.entries(schedule.extra)) out[key] = structuredClone(value);
  for (const day of DAYS) out[day] = serialiseBlocks(schedule.days[day]);
  return out as Omit<RawSchedule, "id">;
}

/**
 * The days a copy from `from` would really change: the chosen days in week order, without
 * duplicates and without the source day itself.
 */
export function copyTargets(from: DayName, to: Iterable<DayName>): DayName[] {
  const chosen = new Set(to);
  return DAYS.filter((day) => day !== from && chosen.has(day));
}

/**
 * Copy one day's blocks onto the chosen days, replacing whatever those days held. Blocks
 * are deep copies (including data keys the card does not know about), the source day is
 * never touched, and the schedule is returned as it is when there is nothing to copy to.
 */
export function copyDay(schedule: Schedule, from: DayName, to: Iterable<DayName>): Schedule {
  const targets = copyTargets(from, to);
  if (targets.length === 0) return schedule;
  const days = { ...schedule.days };
  for (const day of targets) days[day] = schedule.days[from].map(cloneBlock);
  return { ...schedule, days };
}

export function withDay(schedule: Schedule, day: DayName, blocks: Block[]): Schedule {
  return { ...schedule, days: { ...schedule.days, [day]: blocks } };
}
