---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: tooling
---

# The cohort census misses a stray gap inside a stacked member

## What

The row cohort census in `tooling/src/ui-audit/ops/walker/census-cohort.ts` measures a member whose children stack by its content extent, which item 2325 ruled so an open group is not reported. A member whose second stacked child carries a stray top margin is no longer reported either; a review probe showed main reported it and the merged tree does not.

## Why

The ruling traded one false finding for one blind spot, and nobody chose the blind spot.

## Done when

The owner rules whether the census measures summed child heights on the stacking axis, which keeps the open group excused and reports the gap, and a fixture covers the ruled form.

## Evidence

Filled at landing: what ran and where its output is.
