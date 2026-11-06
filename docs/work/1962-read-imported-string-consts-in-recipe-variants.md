---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
plan: cross-surface-consistency
---

# Read imported string consts in recipe variants

## What

ScaleIndex holds object consts only, so FOCUS_RING and SCROLL_FADE_Y_CLASS read as unknown in a recipe variant.

## Why

The refusal is correct but it costs home-surface.tsx and any other element on those variants.

## Done when

That site plans, and card.focusable.true reads as two classes.

## Evidence

Filled at landing: what ran and where its output is.
