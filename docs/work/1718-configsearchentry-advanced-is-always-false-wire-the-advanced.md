---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: client
plan: unwired-code
---

# ConfigSearchEntry.advanced is always false: wire the advanced flag or delete it

## What

Left open. Product question: should the registry's `advanced: true` sections (the Appearance fold) be hidden from Settings search and the palette unless the reader types `@advanced`?

## Why

`ConfigSearchEntry.advanced` is set false at all three build sites in `packages/client/src/features/config/lib/config-search.ts`, so `@advanced` always returns nothing. Wiring it needs `advanced` on `ConfigSubcategory` (the partition drops it in `packages/client/src/state/config-section-registry.ts`) and hides fold settings from default search, which makes them harder to find. Deleting it removes the `@advanced` token and its hint. Both change what a user sees.

## Done when

The owner picks wire or delete; then the flag, the filter axis, the `@advanced` token and `GroupSearchRows` branch either carry real data or are gone together.

## Evidence

No change landed.
