---
kind: decision
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# Decide whether a will-change layer at a fractional landing is a defect

## What

Pixel measurement shows Chromium snaps a will-change layer to the device-pixel grid instead of resampling it, so its glyphs stay crisp but sit up to half a device pixel from layout. Law 3 still judges will-change and 3D layers in promoted-layer-offset. The probe is in reports/cb-promoted/.

## Why

A rule that fires on a crisp, snapped layer would be the same false finding backdrop-filter was; a rule that stops judging a visible offset would hide a real one.

## Done when

docs/law/integer-line-boxes.md section 10 states whether a snapped will-change or 3D layer is judged, with the measurement as the reason, and the promoted-layer-offset rule and its fixtures match that ruling.

## Evidence

Filled at landing: what ran and where its output is.
