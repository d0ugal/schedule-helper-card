import { css } from "lit";

export const styles = css`
  :host {
    display: block;
    --shc-accent: var(--primary-color, #ff9f43);
    --shc-text: var(--primary-text-color, #e6e8ec);
    --shc-muted: var(--secondary-text-color, #8b92a1);
    --shc-line: var(--divider-color, #2a2e38);
    --shc-surface: var(--secondary-background-color, #262a33);
    --shc-on-block: #10131a;
  }
  ha-card {
    padding: 16px;
    color: var(--shc-text);
    display: block;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
  }
  .pill {
    font-size: 11px;
    padding: 3px 9px;
    border-radius: 10px;
    background: var(--shc-surface);
    color: var(--shc-muted);
  }
  .pill.on {
    background: #2b3a2b;
    color: #7bd88f;
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 14px;
  }
  .tab {
    flex: 1;
    border: 0;
    border-radius: 8px;
    padding: 7px 0;
    background: var(--shc-surface);
    color: var(--shc-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .tab[aria-selected="true"] {
    background: var(--shc-accent);
    color: #1a1205;
    font-weight: 700;
  }
  .stage {
    position: relative;
    margin: 8px 0 16px;
    user-select: none;
    -webkit-user-select: none;
  }
  .hour {
    position: absolute;
    left: 0;
    width: 40px;
    font-size: 10px;
    color: var(--shc-muted);
    transform: translateY(-50%);
  }
  .track {
    position: absolute;
    left: 44px;
    right: 150px;
    top: 0;
    bottom: 0;
    background: var(--shc-surface);
    border-radius: 6px;
    cursor: crosshair;
    touch-action: pan-y;
  }
  .grid {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--shc-line);
    pointer-events: none;
  }
  .block {
    position: absolute;
    left: 0;
    right: 0;
    box-sizing: border-box;
    border-radius: 6px;
    border: 1px solid var(--card-background-color, #1c1f26);
    color: var(--shc-on-block);
    overflow: hidden;
  }
  .block.selected {
    outline: 2px solid #fff;
    outline-offset: -1px;
    z-index: 3;
  }
  .label {
    position: absolute;
    left: 0;
    top: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 10px;
    cursor: pointer;
    text-align: left;
    line-height: 1.1;
    max-width: 100%;
  }
  .block.short .label {
    inset: 0;
    width: 100%;
    height: 100%;
    font-size: 0;
    padding: 0;
  }
  .label:focus-visible,
  .handle:focus-visible,
  .tab:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--shc-text);
    outline-offset: 2px;
  }
  .handle {
    position: absolute;
    right: 8px;
    width: 34px;
    height: 10px;
    margin-top: -5px;
    border-radius: 5px;
    background: #fff;
    box-shadow: 0 0 0 2px var(--card-background-color, #1c1f26);
    cursor: ns-resize;
    touch-action: none;
    z-index: 5;
  }
  .handle::after {
    /* a larger invisible hit area for touch */
    content: "";
    position: absolute;
    inset: -12px -8px;
  }
  .gutter {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 142px;
    pointer-events: none;
  }
  .chip,
  .note {
    position: absolute;
    left: 0;
    white-space: nowrap;
    font-size: 12px;
    border-radius: 9px;
  }
  .chip {
    background: #fff;
    color: #111;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 8px;
    transform: translateY(-4px);
  }
  .chip b {
    color: #d4480f;
  }
  .note {
    font-size: 11px;
    padding: 2px 8px;
    white-space: normal;
    max-width: 142px;
    box-sizing: border-box;
  }
  .note.pushed {
    background: #3a2c18;
    color: #ffb454;
  }
  .note.followed {
    background: #1d3248;
    color: #8fd3ff;
  }
  .note.replaced {
    background: #4a1f1f;
    color: #ff8d8d;
  }
  .ghost {
    position: absolute;
    left: 0;
    right: 0;
    border: 2px dashed #ff6b6b;
    border-radius: 6px;
    background: repeating-linear-gradient(
      45deg,
      #ff6b6b33,
      #ff6b6b33 5px,
      transparent 5px,
      transparent 10px
    );
    z-index: 2;
    pointer-events: none;
  }
  .pop {
    position: absolute;
    left: 20px;
    z-index: 8;
    background: #2d323d;
    border: 2px solid var(--shc-accent);
    border-radius: 10px;
    padding: 6px 10px;
    width: 124px;
    box-shadow: 0 6px 18px #0008;
    cursor: default;
  }
  .pop small {
    display: block;
    color: var(--shc-muted);
    font-size: 10px;
  }
  .pop input::-webkit-inner-spin-button,
  .pop input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .pop input {
    -moz-appearance: textfield;
    appearance: textfield;
    width: 70px;
    background: transparent;
    border: 0;
    outline: 0;
    color: var(--shc-text);
    font: inherit;
    font-size: 20px;
    font-weight: 600;
  }
  .guide {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1.5px dashed #fff;
    z-index: 4;
    pointer-events: none;
  }
  .editor {
    margin-top: 14px;
    border-top: 1px solid var(--shc-line);
    padding-top: 12px;
  }
  .editor h3 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--shc-muted);
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }
  .field {
    flex: 1 1 110px;
    background: var(--shc-surface);
    border-radius: 8px;
    padding: 6px 10px;
  }
  .field label {
    display: block;
    color: var(--shc-muted);
    font-size: 10.5px;
  }
  .field input {
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    border: 0;
    outline: 0;
    color: var(--shc-text);
    font: inherit;
    font-size: 16px;
  }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  button.btn {
    border: 0;
    border-radius: 8px;
    padding: 8px 14px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    background: var(--shc-surface);
    color: var(--shc-text);
  }
  button.primary {
    background: var(--shc-accent);
    color: #1a1205;
    font-weight: 600;
  }
  button.danger {
    background: transparent;
    color: #ff6b6b;
  }
  .copy {
    margin-top: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    color: var(--shc-muted);
    font-size: 12px;
  }
  .copy.picks {
    margin-top: 8px;
    flex-wrap: nowrap;
  }
  .daychips {
    display: flex;
    flex: 1;
    gap: 4px;
  }
  button.daychip {
    flex: 1;
    min-width: 0;
    border: 0;
    border-radius: 8px;
    padding: 7px 0;
    background: var(--shc-surface);
    color: var(--shc-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  button.daychip[aria-pressed="true"] {
    background: var(--shc-accent);
    color: #1a1205;
    font-weight: 700;
  }
  button.daychip:disabled {
    opacity: 0.35;
    cursor: default;
  }
  button.btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .status {
    margin-top: 8px;
    font-size: 12px;
    color: var(--shc-muted);
    min-height: 16px;
  }
  .status.error {
    color: #ff8d8d;
  }
  .hint {
    color: var(--shc-muted);
    font-size: 12px;
    margin-bottom: 4px;
  }
`;
