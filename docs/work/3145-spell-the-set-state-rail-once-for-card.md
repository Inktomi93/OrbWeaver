---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Spell the set-state rail once for Card and ListRow

## What

`border-s-rule border-s-primary` is written in `packages/ui/src/primitives/card/variants.ts` (the `rail` branch) and again in `packages/ui/src/primitives/list-row/variants.ts` (the `rail` branch).

## Why

One design idea in two spellings drifts.

## Done when

One shared constant in `packages/ui/src/lib/` that both recipes read.

## Evidence

Filled at landing: what ran and where its output is.
