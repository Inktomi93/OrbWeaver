---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: tooling
plan: surface-walk
---

# Snap wheel steps run at a chosen point without hovering first, and snap gains print-media and point swipe cases

## What

Let a snap wheel step run at a chosen point without hovering first, and give snap a print-media case, a PDF case and a swipe from a chosen point.

## Why

runWheelStep calls loc.hover() in tooling/src/snap/ops/drive-actions.ts. Hovering scrolls nested scrollers into view and voids the scroll-chaining evidence.

## Done when

A wheel step at a chosen point scrolls nothing into view before the wheel. Snap has a print-media or PDF case and a swipe that starts at a chosen point, each with a test.

## Evidence

Filled at landing: what ran and where its output is.

`runWheelStep` calls `loc.hover()` (`tooling/src/snap/ops/drive-actions.ts:30`), which scrolls nested scrollers into view and voids scroll-chaining evidence. Done when a wheel step runs at a chosen point without scrolling anything into view. Also: snap has no print-media or PDF case and no swipe from a chosen point.
