# Schedule Helper Card

A Lovelace card for viewing and editing native Home Assistant
[schedule helpers](https://www.home-assistant.io/integrations/schedule/), including the
per-block data attributes (for example a target temperature).

Status: early scaffold. The card currently shows the state of a schedule helper only.

## Installation

Add this repository to HACS as a custom repository of type "Dashboard", install it, and
add the resource if HACS does not.

## Usage

```yaml
type: custom:schedule-helper-card
entity: schedule.heating
```

## Development

Everything runs through npm scripts (`make install`, `make lint`, `make test`,
`make build`). The bundle is written to `dist/schedule-helper-card.js` and is attached to
each GitHub release by CI.

## Licence

MIT
