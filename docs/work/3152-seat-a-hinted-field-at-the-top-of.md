---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Seat a hinted field at the top of a dialog body

## What

The dialog body scroller in `packages/ui/src/layout/variants.ts` clips on the block axis with no block padding, so a hinted Field as its first child loses up to the bleed's overhang of its hint square at the top of the scroll.

## Why

The panel fold clip now makes room for the hint bleed, but a scroller clips at its padding box and cannot widen its clip.

## Done when

The body seats its first and last rows (a padding step its layout absorbs) or a reason is recorded, measured by a CT with a hinted field first in a dialog.

## Evidence

Filled at landing: what ran and where its output is.
