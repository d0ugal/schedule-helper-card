export interface HassState {
  state: string;
  last_updated?: string;
  attributes: Record<string, unknown>;
}

/** The small part of the Home Assistant frontend object the card uses. */
export interface Hass {
  states: Record<string, HassState | undefined>;
  callWS<T>(message: Record<string, unknown>): Promise<T>;
}

/** One editable number on a block, stored under `key` in the block's data. */
export interface FieldConfig {
  key: string;
  label?: string;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
}

export interface CardConfig {
  /** A schedule helper, for example `schedule.heating`. */
  entity: string;
  name?: string;
  /** Block data fields. The first one is the number typed when a block is created. */
  fields?: FieldConfig[];
  /** Pixels per hour on the timeline. Default 18. */
  hour_height?: number;
  /** Minutes snapped to while dragging. Default 5. */
  step?: number;
  /** Shortest block in minutes. Default 5. */
  min_length?: number;
  /** Length of a newly created block in minutes. Default 60. */
  default_length?: number;
  /** Join touching blocks with identical data after an edit. Default false. */
  merge_equal?: boolean;
}
