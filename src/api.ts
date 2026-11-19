import { type RawSchedule, type Schedule, parseSchedule, serialiseSchedule } from "./model";
import type { Hass } from "./types";

export interface LoadedSchedule {
  schedule: Schedule;
  /** False for helpers that are not stored in the UI (for example YAML ones). */
  editable: boolean;
}

/** The helper id is the registry unique id; fall back to the entity id suffix. */
export async function helperId(hass: Hass, entityId: string): Promise<string> {
  try {
    const entry = await hass.callWS<{ unique_id?: string }>({
      type: "config/entity_registry/get",
      entity_id: entityId,
    });
    if (entry?.unique_id) return entry.unique_id;
  } catch {
    // Not an admin, or the entity has no registry entry.
  }
  return entityId.replace(/^schedule\./, "");
}

export async function loadSchedule(hass: Hass, entityId: string): Promise<LoadedSchedule> {
  const id = await helperId(hass, entityId);
  const items = await hass.callWS<RawSchedule[]>({ type: "schedule/list" });
  const found = items.find((item) => item.id === id);
  if (found) return { schedule: parseSchedule(found), editable: true };

  // Not a stored helper: read the blocks with the service, read only.
  const response = await hass.callWS<{ response: Record<string, RawSchedule> }>({
    type: "call_service",
    domain: "schedule",
    service: "get_schedule",
    target: { entity_id: entityId },
    return_response: true,
  });
  const raw = response.response?.[entityId];
  if (!raw) throw new Error(`Schedule ${entityId} not found`);
  const name = (hass.states[entityId]?.attributes.friendly_name as string | undefined) ?? entityId;
  return { schedule: parseSchedule({ ...raw, name }), editable: false };
}

export async function saveSchedule(
  hass: Hass,
  entityId: string,
  schedule: Schedule,
): Promise<void> {
  const id = schedule.id ?? (await helperId(hass, entityId));
  await hass.callWS({ type: "schedule/update", schedule_id: id, ...serialiseSchedule(schedule) });
}
