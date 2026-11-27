---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: test-foundation
---

# Drop the stale preset tab list from the design-audit fixtures

## What

tests/support/browser/surface-design-fixtures.tsx holds a hand-listed tab strip, STRIP_TABS, naming Parameters, Prompt, Actions, Data and Transforms. The product tab names are Params, Prompt, Actions, Data and Regex, and PRESET_EDITOR_VIEW_LABELS in packages/client/src/features/preset/lib/preset-names.ts is their home.

## Why

A hand copy of a product label list drifts, which the tests-run-the-product rule refuses.

## Done when

The fixture reads the product labels, or the strip is deleted if no case reads it.

## Evidence

The strip fixture in `tests/support/browser/surface-design-fixtures.tsx` lists neutral planted labels, so no case reads product tab names; `tests/support/browser/enlarged-text-geometry.ct.tsx` passes.
