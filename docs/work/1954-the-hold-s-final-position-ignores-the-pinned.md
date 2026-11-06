---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: cross-surface-consistency
---

# The hold's final position ignores the pinned plate

## What

A start-aligned walk and revealIndex land below the pinned action, but the reading-row hold's final position does not, because readingRowOf ignores the plate.

## Why

A held row can settle under the pin.

## Done when

The hold lands below the pin, with a CT at phone and desktop.

## Evidence

Filled at landing: what ran and where its output is.
