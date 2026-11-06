---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Row walks should not take the browser's focus scroll

## What

row\.focus() scrolls natively and races the virtualizer, so a walk can land mid-measurement, and Home then End across unmeasured rows may not resume following. Use focus with preventScroll in row-roving.ts so every step's position comes from the virtualizer alone.

## Why

Two keyboard walk tests cannot fail today, because the native focus scroll rescues the reader and hides what the list does on its own.

## Done when

Every walk step's position comes from the virtualizer, and the walk tests fail when that placement is removed.

## Evidence

Filled at landing: what ran and where its output is.
