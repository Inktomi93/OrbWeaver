---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: ui
plan: cross-surface-consistency
---

# A room flank sheet keeps its lift through its park and a closing phone context sheet keeps its box

## What

The flank-lifted shadow in the shell panels stylesheet likely drops on the first frame of a park, the same class as the collapsing desktop pane, and a closing phone context sheet changes its bottom inset on its first frame because the overlay and collapsed states end at different rows.

## Why

A shadow or a box that changes as motion starts reads as a jump.

## Done when

Component tests read the flank's shadow and the phone sheet's box on every frame of their exits, and both hold constant until the motion ends.

## Evidence

Filled at landing: what ran and where its output is.
