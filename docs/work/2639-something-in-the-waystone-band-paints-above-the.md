---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: rpg
plan: cross-surface-consistency
---

# Something in the Waystone band paints above the band's own box

## What

Measuring the Waystone band's box against its descendants, one element reaches a few pixels above the band's top edge with a scene set, at the reference geometry and at the larger font settings. The element is not identified.

## Why

Content outside its band can lie over the header row above it, and the tighter padding on short panes leaves less room to hide it.

## Done when

The element is named, it either stays inside the band or its overhang is a stated part of the stone's decoration with a test that it never covers a control or text above, and the budget test's whole-pixel height still holds.

## Evidence

Filled at landing: what ran and where its output is.
