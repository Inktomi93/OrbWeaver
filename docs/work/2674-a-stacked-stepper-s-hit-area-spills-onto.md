---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: ui
plan: surface-walk
---

# A stacked stepper's hit area spills onto the field's neighbour at narrow columns

## What

In a narrow column at enlarged text the stacked stepper's touch-target pseudo-element extends past the field's side edge, and the stepper still measures under the floor on the inline axis. In a two-column form the spill lands on the neighbouring field. The floor is tested at only some widths. Measurements are in the client leg review under reports/code-reviewer.

## Why

A tap on the neighbouring control lands on this field's stepper.

## Done when

The field holds a floor-wide stepper inside its own box at every width, by stacking the steppers on separate lines below some width, or the narrowest column a stepped field gets at the largest text is ruled in law and tested; the component test covers that narrowest width.

## Evidence

Filled at landing: what ran and where its output is.
