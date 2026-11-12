---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: ui
lane: wt/agent-ab272ed4fef9cc84a
plan: surface-walk
---

# A number field's stepper does not cover its input at the largest phone text

## What

Below a container step a stepped NumberField stacks its steppers on a line under the input (packages/ui/src/primitives/number-field/variants.ts). Each stepper carries the touch-target pseudo-element (packages/ui/src/lib/selection-control.ts), a square centred on the stepper. At the largest text on a phone that square is much taller than the stepper row and reaches past the centre of the input above it, and it wins the hit test. Proved by a component test on the production field: a tap on the input's centre presses Increase. The walk's covered findings at that size on World Info depth, the workloads token cutoff, library rows per page and automation runs per hour are this one cause. The proof and measurements are in the drafted items under reports/cb-walk-text.

## Why

A person who taps the middle of the number to type into it steps the value up instead, and never gets the keyboard.

## Done when

No stepper's hit area reaches into the input at any container width and text size. A component test taps the stacked input's centre at the largest text on a touch viewport and the input takes focus with its value unchanged, and the same test still finds each stepper at least the touch target in both axes. The walk lists no covered finding for a number field.

## Evidence

Filled at landing: what ran and where its output is.
