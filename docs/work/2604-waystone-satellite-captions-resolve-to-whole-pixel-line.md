---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: rpg
plan: cross-surface-consistency
---

# Waystone satellite captions resolve to whole-pixel line boxes

## What

The ring gauge label and readout and the coin figure label render as HTML spans with no leading class, so they inherit a fractional line height and the Waystone band and everything under it sit on a half pixel. The meter recipe comment in packages/ui/src/charts/meter/variants.ts calls them SVG text. Evidence: the Waystone ladder review under reports/ux-reviewer.

## Why

docs/law/integer-line-boxes.md requires a whole-pixel line box at every font scale, and the rail labels below blur.

## Done when

Every HTML slot of the ring gauge and coin figure recipes takes a ruled leading box, the comment is corrected, and a component test reads whole-pixel band heights in the set and unset cases.

## Evidence

Filled at landing: what ran and where its output is.
