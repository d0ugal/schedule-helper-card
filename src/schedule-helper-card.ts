import { LitElement, html, nothing } from "lit";
import { property } from "lit/decorators.js";

interface HassState {
  state: string;
  attributes: Record<string, unknown>;
}

interface Hass {
  states: Record<string, HassState | undefined>;
}

interface CardConfig {
  entity: string;
}

export class ScheduleHelperCard extends LitElement {
  @property({ attribute: false }) hass?: Hass;
  @property({ attribute: false }) config?: CardConfig;

  setConfig(config: CardConfig): void {
    if (!config?.entity || !config.entity.startsWith("schedule.")) {
      throw new Error("entity must be a schedule helper, for example schedule.heating");
    }
    this.config = config;
  }

  getCardSize(): number {
    return 3;
  }

  render() {
    if (!this.config) return nothing;
    const state = this.hass?.states[this.config.entity];
    return html`<ha-card header=${this.config.entity}>
      <div class="state">${state ? state.state : "unavailable"}</div>
    </ha-card>`;
  }
}

customElements.define("schedule-helper-card", ScheduleHelperCard);
