---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: ui
plan: surface-walk
---

# The stacked NumberField's row height compound variant never applies

## What

`STACKED_ROW` in `packages/ui/src/primitives/number-field/variants.ts` is wired through compound variants keyed by slot, and the resolved class lists carry none of it. The stacked input is therefore only as tall as its text, under the touch floor on a phone at default text, and the steppers' height rides a workaround. Measurements are in the client leg review under reports/code-reviewer.

## Why

The stacked input is a touch control under the floor at every text size, and it is the root cause behind the stepper that took the input's taps.

## Done when

The stacked input and steppers carry their step's block size in the resolved classes, a component test asserts the stacked input's hit extent on the block axis at or above the touch floor at default and the largest text, and the steppers' extra minimum block size is dropped if the row height alone meets the floor.

## Evidence

Filled at landing: what ran and where its output is.
