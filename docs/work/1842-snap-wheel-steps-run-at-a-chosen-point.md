---
kind: work
status: open
updated: 2026-11-02
priority: P3
area: tooling
plan: surface-walk
---

# Snap wheel steps run at a chosen point without hovering first, and snap gains print-media and point swipe cases

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

`runWheelStep` calls `loc.hover()` (`tooling/src/snap/ops/drive-actions.ts:30`), which scrolls nested scrollers into view and voids scroll-chaining evidence. Done when a wheel step runs at a chosen point without scrolling anything into view. Also: snap has no print-media or PDF case and no swipe from a chosen point.
