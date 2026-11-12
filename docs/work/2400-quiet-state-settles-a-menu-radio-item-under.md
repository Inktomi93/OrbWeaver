---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: surface-walk
---

# quiet-state settles a menu radio item under the popup's scroll-shadow gradient

## What

quiet-state withholds \[data-slot=menu-radio-item] samples under the menu popup's scroll-shadow covers as gradient-over-base, because quiet-state has no pixel settle for a gradient over an opaque base.

## Why

Withheld quiet-state rows leave a menu's resting option contrast unjudged.

## Done when

quiet-state settles the fill from pixels, or the popup's covers are recognised as opaque where the item sits, with a fixture under the popup gradient and a control that still withholds a truly unknown base.

## Evidence

Filled at landing: what ran and where its output is.
