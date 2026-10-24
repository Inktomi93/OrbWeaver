---
kind: work
status: doing
updated: 2026-10-24
priority: P2
area: ui
lane: cb-css
plan: css-system
---

# Build the CSS system: ramps, conditions, locked TSX and theme-aware variants

## What

Build the css-system plan's legs: the primitive ramp tier with semantic aliases, one conditions vocabulary, Tailwind namespace resets that lock TSX to the ramps, stylelint allow-lists over the hand-written CSS, @orb/ui variants built for the theme engine and appearance, ramp values derived from UI law, and the CSS file cleanup. No compatibility shims.

## Why

Values sprawl across role-named tokens, the Tailwind default scale and raw literals, and the same breakpoint and pointer conditions are spelled several ways; nothing forces a surface onto a scale.

## Done when

The plan's legs are built as its Shape states; every control in its Test plan fails on a planted defect; the main surfaces pass side-eye at desktop and phone; whole-tree lint, stylelint and depcruise are green.

## Evidence

Filled at landing: what ran and where its output is.
