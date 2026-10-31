---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: plugin
plan: cross-surface-consistency
---

# Pocket Arcade fits its flank and its grant reads as a sentence

## What

The grant text starts lowercase ('runs its own interface code…') in `packages/client/src/features/plugin/lib/plugin-copy.ts:145`. `packages/client/src/features/plugin/components/plugin-grant-list.tsx:246` renders it as a continuation clause. Whether it takes sentence case is the open question. The 'New game' wrap is fixed (`packages/showcase-plugins/bundles/pocket-arcade/main.ts:73-74`).

## Why

Plugin final pass finding.

## Done when

The owner rules the grant copy form, and the rendered grant line reads as a sentence in that form.

## Evidence

- Owner ruling: the plugin consent line takes sentence case, first letter only. `packages/client/src/features/plugin/lib/plugin-copy.ts:145` now reads "Runs its own interface code…". No other wording changed.
- `capabilityCopy().consequence` has one consumer, `packages/client/src/features/plugin/components/plugin-grant-list.tsx:245`, which renders it as its own `Text` paragraph under the label row, not as a clause after the label. ast-grep `$X.consequence` scanned `packages` and `tests`: ts 0 matches, tsx 1 match. No test or other package asserts the string.
- New game wrap: the `GAME_CSS` and markup from `packages/showcase-plugins/bundles/pocket-arcade/main.ts` rendered at a 240px flank width in a 320x700 viewport. `new=4,58,232,32` sits on its own row under both score boxes (`score=4,4,112,46`, `best=124,4,112,46`), `noClip=true`, `white-space: nowrap`. Run slot `reports/runs/snap/agent-a81f5ee07cc8e702b-1788184-2026-10-31T19-48-30-265Z/run.json`, log `cb7a-arcade.log` in the lane scratchpad. This is the bundle's CSS in a plain page, not the live installed frame; load was 34 on 24 cores, so the run is marked load-suspect, but the numbers are layout, not timing.
