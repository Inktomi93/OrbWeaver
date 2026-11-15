---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: rpg
---

# The rpg config update merges against the config it writes over

## What

The update in `packages/server/src/domain/rpg/verbs/game/update-config.ts` merges the patch onto the config read when the host was resolved and writes the merged config whole after awaits, so concurrent config updates lose the earlier one's fields. Derive the merge inside the write.

## Why

Config carries independent knobs, and a whole-object write from a stale read resets a knob the other edit set.

## Done when

A test sends concurrent config updates for different fields and reads both fields back.

## Evidence

Filled at landing: what ran and where its output is.
