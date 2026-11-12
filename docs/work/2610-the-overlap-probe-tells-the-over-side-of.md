---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: testing
plan: surface-walk
---

# The overlap probe tells the over side of a declared overlay from the under side

## What

The enlarged-text overlap probe in tests/support/browser/enlarged-text-geometry.ts treats a pair as design when both controls sit in declaring boxes of one relation. It does not tell the over box from the under box, so two over-side boxes of one relation that overlap each other read as declared design, and an under box wider than the controls under the design is not judged. The law bullets in docs/law/ui-platform-rulings.md speak of over, under and the narrowest box.

## Why

The law's wording claims more than the probe checks.

## Done when

A planted pair of same-relation over-side boxes that overlap each other is a finding and an over-wide under box is judged, or the law bullets state only that the two boxes declare one relation.

## Evidence

Filled at landing: what ran and where its output is.
