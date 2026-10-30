---
kind: work
status: open
updated: 2026-10-30
priority: P1
area: ui
plan: surface-walk
---

# Make every text size come from the governed type ramp and scale with the font-size setting

## What

Owner ruling when removing the D11 2:1 ratio finding: surfaces must pick sizes from the governed font ramp like a real design system, never raw sizes, and the font-size setting must scale all of it. Audit where components size text outside the ramp tokens and where the font-size setting fails to reach, then fix adoption at the shared components.

## Why

Codex removed the crude ratio check but never did the ramp adoption the owner asked for in the same answer; 1411 only covers sandboxed card and plugin frames.

## Done when

No authored text size outside the ramp tokens except documented exceptions; the font-size setting scales every in-app surface; a production-mounted check proves both and fails on a raw size.

## Evidence

Filled at landing: what ran and where its output is.
