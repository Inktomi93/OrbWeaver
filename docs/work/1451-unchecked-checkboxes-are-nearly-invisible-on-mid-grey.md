---
kind: bug
status: open
updated: 2026-10-30
priority: P3
area: ui
---

# Unchecked checkboxes are nearly invisible on mid-grey custom themes

## What

On a mid-grey custom theme, an unchecked checkbox's border is nearly invisible.

## Why

Pre-existing; side-eye found it during the tone review. An unchecked control must show its boundary (WCAG 1.4.11).

## Done when

The unchecked checkbox border clears 3:1 against its host in each seed and on `oklch(0.6 0 0)`, pinned by a CT.

## Evidence

Filled at landing: what ran and where its output is.
