---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Census the prose measure on the character, composer and dialog surfaces

## What

The line-length census in `tests/client/features/app-shell/line-length-census.suite.ct.tsx` mounts sections and settings groups only. The character overview and Look tab, the greeting actions, the composer menu items and a dialog form are not judged by the `line-length` rule.

## Why

The `Text` paragraph cap now owns the measure, but a surface no census mounts can regress unseen.

## Done when

A CT mounts each of those surfaces through its production door and the design audit reports no `line-length` finding with a positive judged count.

## Evidence

Filled at landing: what ran and where its output is.
