/** Minutes since midnight. A block may end at 1440 (24:00). */
export const DAY_MINUTES = 1440;

/**
 * Parse "HH:MM" or "HH:MM:SS" into minutes. Seconds are dropped. An end time of 23:59 or
 * later counts as 24:00, because Home Assistant's own helper dialog stores a full-day block
 * as 00:00 to 23:59:59.
 */
export function parseTime(value: string, isEnd = false): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) {
    throw new Error(`Invalid time: ${value}`);
  }
  const total = hours * 60 + minutes;
  if (isEnd && total >= DAY_MINUTES - 1) return DAY_MINUTES;
  return total;
}

/** Format minutes as "HH:MM" (1440 becomes "24:00"). */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Format minutes as the "HH:MM:SS" string Home Assistant stores. */
export function formatTimeHa(minutes: number): string {
  return `${formatTime(minutes)}:00`;
}

/** Round to the nearest multiple of `step` minutes. */
export function snap(minutes: number, step = 5): number {
  return Math.round(minutes / step) * step;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
