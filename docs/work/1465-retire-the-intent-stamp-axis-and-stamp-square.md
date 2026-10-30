---
kind: tooling
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Retire the intent stamp axis and stamp square controls apart

## What

After 1421 step 3 no recipe declares intent, but STAMPED_VARIANT_AXES in packages/ui/src/lib/variant-attrs.ts still lists it, as do the ui-audit walker's TARGET_VARIANT_ATTRS and tests/tooling/ui-audit/ops/walker/target-identity tests. A square button also stamps the same data-size as a text button of that step, so the walker treats them as one authored size decision.

## Why

A dead axis in the stamp vocabulary and a missing square stamp give the design audit wrong cohorts.

## Done when

intent is gone from the stamp vocabulary and the walker list, a square control stamps its shape, and the walker identity tests pass.

## Evidence

Filled at landing: what ran and where its output is.
