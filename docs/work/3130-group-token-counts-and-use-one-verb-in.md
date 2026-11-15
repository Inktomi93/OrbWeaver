---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Group token counts and use one verb in the preset limits rows

## What

The clamp gloss (effective-knobs.ts clampGloss) and the Max output hint (params-limits.tsx) print ungrouped token counts while the context note groups them, the number twins print ungrouped values, and the rows say 'clamped' for one row and 'capped' for the other.

## Why

Two formats and two verbs for one fact on adjacent rows read as two different mechanisms.

## Done when

Every token count on the limits rows is grouped and one verb names the cap, pinned by a CT.

## Evidence

Filled at landing: what ran and where its output is.
