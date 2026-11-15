---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: import
plan: cross-surface-consistency
---

# A left-out reason whose own text says part of it imported is shown as no equivalent

## What

`custom_stopping_strings_macro`: its source reason says "the strings themselves DO import" (`packages/contracts/src/preset/index.ts`), and that half is lost when the Presets page door shows "This app has no equivalent." for every field outside its plain-reason table. The same class held for a clamped value, which now has its own `clamped` group in the preview.

## Why

The fallback sentence overrides a source reason that says something true and more specific.

## Done when

The plain reasons live beside the fields in contracts, see the plain-reasons item, and the fallback is gone.

## Evidence

Filled at landing: what ran and where its output is.
