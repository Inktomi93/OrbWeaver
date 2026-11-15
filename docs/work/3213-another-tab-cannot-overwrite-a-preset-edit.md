---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: preset
---

# Another tab cannot overwrite a preset edit

## What

`updatePresetRow` in `packages/server/src/domain/preset/persistence/queries.ts` guards only against overwriting an unreadable stored blob; the update carries no revision, so a tab holding an older copy of the preset writes its whole config over a newer save from another tab. Carry the revision the editor read, refuse a stale write with a typed outcome, and have the editor show the conflict.

## Why

The preset editor autosaves whole configs, so a forgotten second tab silently reverts edits made in the first.

## Done when

A server test writes with a stale revision and gets the typed refusal while the stored config is unchanged, and a client test shows the conflict in the editor.

## Evidence

Filled at landing: what ran and where its output is.
