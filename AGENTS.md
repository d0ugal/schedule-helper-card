# Repository instructions

These rules apply to human and automated contributors.

## Purpose

A Lovelace card that views and edits native Home Assistant `schedule` helpers, including
per-block `data`. It uses the helper's own services and websocket API; it needs no extra
Home Assistant integration.

## Workflow

- Never commit to `main`. Branch, push, open a PR with `gh pr create`, and follow
  `gh pr checks` until green. Merge only when the owner says so, with
  `gh pr merge --rebase --delete-branch`.
- Conventional commits, atomic, no `Co-Authored-By` trailer. Breaking changes use `!` and a
  `BREAKING CHANGE:` footer.
- Every fix or feature comes with a test.
- Do not use em dashes in prose.

## Stack

TypeScript, Lit, esbuild, vitest, eslint, prettier. Run `make lint test build`. Install
dependencies inside a Node container, not on the host.

## Releases

release-please opens the release PR. When a release is published, the Release asset
workflow builds `dist/schedule-helper-card.js` and uploads it to the release. The Home
Assistant deploy downloads that asset for the pinned tag.
