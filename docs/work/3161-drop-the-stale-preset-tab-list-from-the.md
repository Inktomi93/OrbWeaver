---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
---

# Drop the stale preset tab list from the design-audit fixtures

## What

tests/support/browser/surface-design-fixtures.tsx holds a hand-listed tab strip, STRIP_TABS, naming Parameters, Prompt, Actions, Data and Transforms. The product's tab names are Params, Prompt, Actions, Data and Transforms, and PRESET_EDITOR_VIEW_LABELS in packages/client/src/features/preset/lib/preset-names.ts is their home.

## Why

A hand copy of a product label list drifts, which the tests-run-the-product rule refuses.

## Done when

The fixture reads the product labels, or the strip is deleted if no case reads it.

## Evidence

Filled at landing: what ran and where its output is.
