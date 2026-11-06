---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Neutral alpha colours become named roles

## What

Replace opacity modifiers on neutral colours, such as bg-foreground/45 and text-muted-foreground/60, with named roles, and settle number-field's active:bg-accent/hover the same way.

## Why

D336 removed hand-mixed tints for tones; neutral colours still mix by hand.

## Done when

No recipe writes an opacity modifier on a neutral colour, and a lint rule refuses a new one.

## Evidence

Filled at landing: what ran and where its output is.
