import { LitElement, html, nothing } from "lit";
import { property, state } from "lit/decorators.js";
import { loadSchedule, saveSchedule } from "./api";
import { colorFor, rangeOf } from "./color";
import { stackTops } from "./layout";
import {
  type Block,
  DAYS,
  DAY_LABELS,
  type DayName,
  type Edge,
  type Effect,
  type Schedule,
  WEEKDAYS,
  copyDay,
  createBlockAt,
  deleteBlock,
  formatTime,
  mergeAdjacentEqual,
  resizeBlock,
  serialiseSchedule,
  setBlockData,
  snap,
  withDay,
} from "./model";
import { styles } from "./styles";
import type { CardConfig, FieldConfig, Hass } from "./types";

interface Draft {
  blocks: Block[];
  index: number;
  effects: Effect[];
}

interface Drag {
  index: number;
  edge: Edge;
  base: Block[];
  pointerId: number;
  /** Last snapped minute under the pointer, so Alt can re-run the edit. */
  minute?: number;
  /** Alt is held: leave a gap instead of pulling the touching neighbour along. */
  detach: boolean;
}

const DEFAULT_FIELDS: FieldConfig[] = [{ key: "value", label: "Value" }];
const DAY_NAMES: Record<DayName, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function today(): DayName {
  return DAYS[(new Date().getDay() + 6) % 7] as DayName;
}

export class ScheduleHelperCard extends LitElement {
  static override styles = styles;

  @property({ attribute: false }) hass?: Hass;
  @property({ attribute: false }) config?: CardConfig;

  @state() private schedule?: Schedule;
  @state() private editable = true;
  @state() private day: DayName = today();
  @state() private selected?: number;
  @state() private draft?: Draft;
  @state() private creating?: { minute: number };
  @state() private copyPending?: "weekdays" | "all";
  @state() private status = "";
  @state() private error = "";

  private drag?: Drag;
  private loaded = false;
  private lastUpdated?: string;
  private latest?: Schedule;
  private flushing = false;

  setConfig(config: CardConfig): void {
    if (!config?.entity || !config.entity.startsWith("schedule.")) {
      throw new Error("entity must be a schedule helper, for example schedule.heating");
    }
    this.config = config;
    this.loaded = false;
  }

  getCardSize(): number {
    return 12;
  }

  static getStubConfig(): CardConfig {
    return { entity: "schedule.example" };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onWindowKey);
    window.addEventListener("keyup", this.onWindowKeyUp);
  }

  override disconnectedCallback(): void {
    window.removeEventListener("keydown", this.onWindowKey);
    window.removeEventListener("keyup", this.onWindowKeyUp);
    super.disconnectedCallback();
  }

  // ---- config helpers ---------------------------------------------------

  private get fields(): FieldConfig[] {
    return this.config?.fields?.length ? this.config.fields : DEFAULT_FIELDS;
  }

  private get primary(): FieldConfig {
    return this.fields[0] as FieldConfig;
  }

  private get hourHeight(): number {
    return this.config?.hour_height ?? 18;
  }

  private get step(): number {
    return this.config?.step ?? 5;
  }

  private get editOptions() {
    return { minLength: this.config?.min_length ?? 5, step: this.step };
  }

  private y(minutes: number): number {
    return (minutes / 60) * this.hourHeight;
  }

  private get dayBlocks(): Block[] {
    return this.schedule?.days[this.day] ?? [];
  }

  private get shownBlocks(): Block[] {
    return this.draft?.blocks ?? this.dayBlocks;
  }

  private get shownSelected(): number | undefined {
    return this.draft ? this.draft.index : this.selected;
  }

  private primaryValue(block: Block): number | undefined {
    const v = block.data?.[this.primary.key];
    return typeof v === "number" ? v : undefined;
  }

  private formatValue(block: Block, field: FieldConfig = this.primary): string {
    const v = block.data?.[field.key];
    if (v === undefined || v === null) return "–";
    const unit = field.unit === "°C" || field.unit === "°F" ? "°" : (field.unit ?? "");
    return `${v}${unit}`;
  }

  // ---- loading and saving -----------------------------------------------

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (!changed.has("hass") && !changed.has("config")) return;
    if (!this.hass || !this.config) return;
    const updated = this.hass.states[this.config.entity]?.last_updated;
    if (!this.loaded) {
      this.loaded = true;
      void this.load(true);
    } else if (updated !== this.lastUpdated) {
      void this.load(false);
    }
    this.lastUpdated = updated;
  }

  private get busy(): boolean {
    return Boolean(this.drag) || this.flushing || Boolean(this.latest);
  }

  private async load(force: boolean): Promise<void> {
    if (!this.hass || !this.config) return;
    try {
      const { schedule, editable } = await loadSchedule(this.hass, this.config.entity);
      if (!force && this.busy) return;
      const same =
        this.schedule &&
        JSON.stringify(serialiseSchedule(this.schedule)) ===
          JSON.stringify(serialiseSchedule(schedule));
      if (!same) this.schedule = schedule;
      this.editable = editable;
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private commit(schedule: Schedule): void {
    this.schedule = schedule;
    this.latest = schedule;
    this.status = "Saving…";
    this.error = "";
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing || !this.hass || !this.config) return;
    this.flushing = true;
    try {
      while (this.latest) {
        const next = this.latest;
        this.latest = undefined;
        await saveSchedule(this.hass, this.config.entity, next);
      }
      this.status = "Saved";
    } catch (err) {
      this.latest = undefined;
      this.status = "";
      const message = `Could not save: ${err instanceof Error ? err.message : String(err)}`;
      this.flushing = false;
      await this.load(true);
      this.error = message;
      return;
    }
    this.flushing = false;
  }

  private applyDay(blocks: Block[]): void {
    if (!this.schedule) return;
    const next = this.config?.merge_equal ? mergeAdjacentEqual(blocks) : blocks;
    if (next.length !== blocks.length) this.selected = undefined;
    this.commit(withDay(this.schedule, this.day, next));
  }

  // ---- interaction ------------------------------------------------------

  private minuteAt(clientY: number): number {
    const track = this.renderRoot.querySelector(".track");
    const top = track ? track.getBoundingClientRect().top : 0;
    const minutes = ((clientY - top) / this.hourHeight) * 60;
    return Math.min(Math.max(minutes, 0), 1440);
  }

  /** Alt held or released mid-drag switches between following and leaving a gap. */
  private setDetach(detach: boolean): void {
    const drag = this.drag;
    if (!drag || drag.detach === detach) return;
    drag.detach = detach;
    this.updateDraft(drag);
  }

  private readonly onWindowKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "Alt") this.setDetach(false);
  };

  private readonly onWindowKey = (e: KeyboardEvent): void => {
    if (e.key === "Alt") this.setDetach(true);
    if (e.key !== "Escape") return;
    if (this.drag) this.cancelDrag();
    else if (this.creating) this.creating = undefined;
    else if (this.copyPending) this.copyPending = undefined;
  };

  private cancelDrag(): void {
    this.drag = undefined;
    this.draft = undefined;
  }

  private onTrackClick(e: MouseEvent): void {
    if (!this.editable || !this.schedule) return;
    if ((e.target as Element).closest(".handle, .label, .pop")) return;
    this.creating = { minute: snap(this.minuteAt(e.clientY), this.step) };
  }

  private onPopKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.stopPropagation();
      this.creating = undefined;
      return;
    }
    if (e.key !== "Enter" || !this.creating || !this.schedule) return;
    e.preventDefault();
    const raw = (e.target as HTMLInputElement).value;
    const value = Number(raw);
    if (raw.trim() === "" || Number.isNaN(value)) return;
    const field = this.primary;
    const clamped = Math.min(Math.max(value, field.min ?? -Infinity), field.max ?? Infinity);
    const result = createBlockAt(
      this.dayBlocks,
      this.creating.minute,
      { [field.key]: clamped },
      {
        ...this.editOptions,
        length: this.config?.default_length ?? 60,
      },
    );
    this.creating = undefined;
    this.selected = result.index;
    this.applyDay(result.blocks);
  }

  private select(index: number): void {
    this.creating = undefined;
    this.copyPending = undefined;
    this.selected = this.selected === index ? undefined : index;
  }

  private onHandleDown(e: PointerEvent, edge: Edge): void {
    if (!this.editable || this.selected === undefined) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.creating = undefined;
    this.drag = {
      index: this.selected,
      edge,
      base: this.dayBlocks,
      pointerId: e.pointerId,
      detach: e.altKey,
    };
  }

  private updateDraft(drag: Drag): void {
    if (drag.minute === undefined) return;
    const r = resizeBlock(drag.base, drag.index, drag.edge, drag.minute, {
      ...this.editOptions,
      detach: drag.detach,
    });
    this.draft = { blocks: r.blocks, index: r.index, effects: r.effects };
  }

  private onHandleMove(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.minute = snap(this.minuteAt(e.clientY), this.step);
    drag.detach = e.altKey;
    this.updateDraft(drag);
  }

  private onHandleUp(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const draft = this.draft;
    this.cancelDrag();
    if (!draft) return;
    this.selected = draft.index;
    this.applyDay(draft.blocks);
  }

  private onHandleKey(e: KeyboardEvent, edge: Edge): void {
    if (!this.editable || this.selected === undefined) return;
    const block = this.dayBlocks[this.selected];
    if (!block) return;
    let delta: number;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") delta = -this.step;
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") delta = this.step;
    else if (e.key === "PageUp") delta = -60;
    else if (e.key === "PageDown") delta = 60;
    else return;
    if (e.shiftKey && Math.abs(delta) < 60) delta = Math.sign(delta) * 60;
    e.preventDefault();
    const result = resizeBlock(this.dayBlocks, this.selected, edge, block[edge] + delta, {
      ...this.editOptions,
      detach: e.altKey,
    });
    this.selected = result.index;
    this.applyDay(result.blocks);
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLElement>(`.handle[data-edge="${edge}"]`)?.focus();
    });
  }

  private onFieldChange(field: FieldConfig, e: Event): void {
    if (this.selected === undefined) return;
    const block = this.dayBlocks[this.selected];
    if (!block) return;
    const input = e.target as HTMLInputElement;
    const data = { ...block.data };
    if (input.value.trim() === "" && field !== this.primary) {
      delete data[field.key];
    } else {
      const value = Number(input.value);
      if (input.value.trim() === "" || Number.isNaN(value)) {
        input.value = String(block.data?.[field.key] ?? "");
        return;
      }
      data[field.key] = Math.min(Math.max(value, field.min ?? -Infinity), field.max ?? Infinity);
    }
    this.applyDay(setBlockData(this.dayBlocks, this.selected, data));
  }

  private onDelete(): void {
    if (this.selected === undefined) return;
    const blocks = deleteBlock(this.dayBlocks, this.selected);
    this.selected = undefined;
    this.applyDay(blocks);
  }

  private onCopy(kind: "weekdays" | "all"): void {
    if (!this.schedule) return;
    this.commit(copyDay(this.schedule, this.day, kind === "weekdays" ? WEEKDAYS : DAYS));
    this.copyPending = undefined;
  }

  private setDay(day: DayName): void {
    this.day = day;
    this.selected = undefined;
    this.creating = undefined;
    this.copyPending = undefined;
    this.cancelDrag();
  }

  // ---- rendering --------------------------------------------------------

  protected override render() {
    if (!this.config) return nothing;
    const entity = this.hass?.states[this.config.entity];
    const title = this.config.name ?? this.schedule?.name ?? this.config.entity;
    const current = entity?.attributes[this.primary.key];
    const pill = entity
      ? `${entity.state}${typeof current === "number" ? ` · ${current}${this.primary.unit === "°C" ? "°" : (this.primary.unit ?? "")}` : ""}`
      : "unavailable";

    return html`<ha-card>
      <div class="head">
        <h2>${title}</h2>
        <span class="pill ${entity?.state === "on" ? "on" : ""}">${pill}</span>
      </div>
      <div class="tabs" role="tablist">
        ${DAYS.map(
          (d) =>
            html`<button
              class="tab"
              role="tab"
              aria-selected=${d === this.day ? "true" : "false"}
              data-day=${d}
              @click=${() => this.setDay(d)}
            >
              ${DAY_LABELS[d]}
            </button>`,
        )}
      </div>
      ${this.schedule ? this.renderStage() : html`<div class="hint">Loading…</div>`}
      ${this.renderEditor()} ${this.renderCopy()}
      <div class="status ${this.error ? "error" : ""}" aria-live="polite">
        ${this.error || this.status}
      </div>
    </ha-card>`;
  }

  private renderStage() {
    const blocks = this.shownBlocks;
    const sel = this.shownSelected;
    const allValues = DAYS.flatMap((d) =>
      (this.schedule?.days[d] ?? [])
        .map((b) => this.primaryValue(b))
        .filter((v): v is number => v !== undefined),
    );
    const range = rangeOf(allValues);
    const height = this.y(1440);

    const items: { top: number; node: unknown }[] = [];
    const selBlock = sel === undefined ? undefined : blocks[sel];
    if (selBlock) {
      const edge = this.drag?.edge;
      items.push({
        top: this.y(selBlock.start) - 4,
        node: (top: number) =>
          html`<div class="chip" style="top:${top}px">
            ${this.formatValue(selBlock)} ·
            ${
              edge === "start"
                ? html`<b>${formatTime(selBlock.start)}</b>`
                : formatTime(selBlock.start)
            }
            →
            ${edge === "end" ? html`<b>${formatTime(selBlock.end)}</b>` : formatTime(selBlock.end)}
          </div>`,
      });
    }
    const ghosts: unknown[] = [];
    for (const fx of this.draft?.effects ?? []) {
      const label = this.formatValue(fx.original);
      if (fx.kind === "replaced") {
        ghosts.push(
          html`<div
            class="ghost"
            style="top:${this.y(fx.original.start)}px;height:${this.y(fx.original.end) - this.y(fx.original.start)}px"
          ></div>`,
        );
        items.push({
          top: this.y(fx.original.start) + 8,
          node: (top: number) =>
            html`<div class="note replaced" style="top:${top}px">${label} replaced</div>`,
        });
      } else if (fx.result) {
        const movedStart = fx.result.start !== fx.original.start;
        const to = formatTime(movedStart ? fx.result.start : fx.result.end);
        const verb = fx.kind === "followed" ? "follows" : "pushed";
        items.push({
          top: this.y(movedStart ? fx.result.start : fx.result.end) + 4,
          node: (top: number) =>
            html`<div class="note ${fx.kind}" style="top:${top}px">${label} ${verb} to ${to}</div>`,
        });
      }
    }
    const tops = stackTops(items.map((i) => i.top));

    return html`<div class="stage" style="height:${height}px">
      ${[0, 6, 12, 18, 24].map(
        (h) =>
          html`<div class="hour" style="top:${this.y(h * 60)}px">
            ${String(h).padStart(2, "0")}:00
          </div>`,
      )}
      <div class="track" @click=${(e: MouseEvent) => this.onTrackClick(e)}>
        ${[0, 6, 12, 18, 24].map((h) => html`<div class="grid" style="top:${this.y(h * 60)}px"></div>`)}
        ${blocks.map((b, i) => this.renderBlock(b, i, i === sel, range))} ${ghosts}
        ${
          selBlock && this.editable
            ? (["start", "end"] as Edge[]).map((edge) => this.renderHandle(selBlock, edge))
            : nothing
        }
        ${this.creating ? this.renderPopover(this.creating.minute) : nothing}
      </div>
      <div class="gutter">
        ${items.map((item, i) => (item.node as (top: number) => unknown)(tops[i] as number))}
      </div>
    </div>`;
  }

  private renderBlock(
    block: Block,
    index: number,
    selected: boolean,
    range: { min: number; max: number },
  ) {
    const top = this.y(block.start);
    const height = this.y(block.end) - top;
    return html`<div
      class="block ${selected ? "selected" : ""} ${height < 16 ? "short" : ""}"
      data-index=${index}
      style="top:${top}px;height:${height}px;background:${colorFor(this.primaryValue(block), range)}"
    >
      <button
        class="label"
        aria-label="Block ${formatTime(block.start)} to ${formatTime(block.end)}, ${this.formatValue(block)}"
        aria-pressed=${selected ? "true" : "false"}
        @click=${(e: Event) => {
          e.stopPropagation();
          this.select(index);
        }}
      >
        ${this.formatValue(block)}
      </button>
    </div>`;
  }

  private renderHandle(block: Block, edge: Edge) {
    const minutes = block[edge];
    return html`<div
      class="handle"
      role="slider"
      tabindex="0"
      data-edge=${edge}
      aria-label=${edge === "start" ? "Block start" : "Block end"}
      aria-orientation="vertical"
      title="Drag to resize. Hold Alt to leave a gap instead of moving the neighbour."
      aria-valuemin="0"
      aria-valuemax="1440"
      aria-valuenow=${minutes}
      aria-valuetext=${formatTime(minutes)}
      style="top:${this.y(minutes)}px"
      @pointerdown=${(e: PointerEvent) => this.onHandleDown(e, edge)}
      @pointermove=${(e: PointerEvent) => this.onHandleMove(e)}
      @pointerup=${(e: PointerEvent) => this.onHandleUp(e)}
      @pointercancel=${() => this.cancelDrag()}
      @keydown=${(e: KeyboardEvent) => this.onHandleKey(e, edge)}
    ></div>`;
  }

  private renderPopover(minute: number) {
    const field = this.primary;
    return html`<div class="guide" style="top:${this.y(minute)}px"></div>
      <div
        class="pop"
        style="top:${this.y(minute) + 6}px"
        @keydown=${(e: KeyboardEvent) => this.onPopKey(e)}
      >
        <small>${field.label ?? field.key} at ${formatTime(minute)}</small>
        <input
          type="number"
          inputmode="decimal"
          step=${field.step ?? 1}
          min=${field.min ?? nothing}
          max=${field.max ?? nothing}
          aria-label="${field.label ?? field.key} for the new block"
        />
        ${field.unit ?? ""}
      </div>`;
  }

  protected override updated(changed: Map<string, unknown>): void {
    if (changed.has("creating") && this.creating) {
      this.renderRoot.querySelector<HTMLInputElement>(".pop input")?.focus();
    }
  }

  private renderEditor() {
    const index = this.selected;
    const block = index === undefined ? undefined : this.dayBlocks[index];
    const shown =
      this.shownSelected === undefined ? undefined : this.shownBlocks[this.shownSelected];
    if (!block) {
      return html`<div class="hint">
        ${
          this.editable
            ? "Click the timeline and type a number to add a block. Click a value to edit it."
            : "This schedule is read only because it is not stored in the Home Assistant UI."
        }
      </div>`;
    }
    return html`<div class="editor">
      <h3>
        ${DAY_NAMES[this.day]} · ${formatTime((shown ?? block).start)} –
        ${formatTime((shown ?? block).end)}
      </h3>
      <div class="fields">
        ${this.fields.map(
          (f) =>
            html`<div class="field">
              <label for="f-${f.key}">${f.label ?? f.key}${f.unit ? ` (${f.unit})` : ""}</label>
              <input
                id="f-${f.key}"
                type="number"
                inputmode="decimal"
                step=${f.step ?? 1}
                min=${f.min ?? nothing}
                max=${f.max ?? nothing}
                .value=${String(block.data?.[f.key] ?? "")}
                ?disabled=${!this.editable}
                @change=${(e: Event) => this.onFieldChange(f, e)}
              />
            </div>`,
        )}
      </div>
      <div class="actions">
        <button class="btn danger" ?disabled=${!this.editable} @click=${() => this.onDelete()}>
          Delete block
        </button>
        <button class="btn primary" @click=${() => (this.selected = undefined)}>Done</button>
      </div>
    </div>`;
  }

  private renderCopy() {
    if (!this.editable || !this.schedule) return nothing;
    const name = DAY_LABELS[this.day];
    if (this.copyPending) {
      const target = this.copyPending === "weekdays" ? "Mon to Fri" : "every day";
      return html`<div class="copy">
        <span>Copy ${name} to ${target}, replacing what is there?</span>
        <span>
          <button
            class="btn primary"
            @click=${() => this.onCopy(this.copyPending as "weekdays" | "all")}
          >
            Copy
          </button>
          <button class="btn" @click=${() => (this.copyPending = undefined)}>Cancel</button>
        </span>
      </div>`;
    }
    return html`<div class="copy">
      <span>Copy ${name} to</span>
      <span>
        <button class="btn" data-copy="weekdays" @click=${() => (this.copyPending = "weekdays")}>
          Weekdays
        </button>
        <button class="btn" data-copy="all" @click=${() => (this.copyPending = "all")}>
          All days
        </button>
      </span>
    </div>`;
  }
}

customElements.define("schedule-helper-card", ScheduleHelperCard);

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string }[];
  }
}
window.customCards = window.customCards ?? [];
window.customCards.push({
  type: "schedule-helper-card",
  name: "Schedule Helper Card",
  description: "View and edit a native schedule helper, including per-block data",
});
