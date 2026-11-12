---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: ui
plan: surface-walk
---

# A number field's stepper does not cover its input at the largest phone text

## What

At the largest text on a phone the walk reports a number field's input covered at its centre by its own Increase button; the stepper's touch-target pseudo-element may reach it. Not yet proved by a component test.

## Why

A covered input cannot be tapped to type.

## Done when

A component test on the production number field in a phone-width column at the largest text shows whether the cover is real. If it is, the stepper keeps clear of the input's centre; if not, the probe is fixed with a control.

## Evidence

Filled at landing: what ran and where its output is.
