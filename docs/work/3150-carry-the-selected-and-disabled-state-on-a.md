---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Carry the selected and disabled state on a disclosure ListRow

## What

The disclosure branch of `ListRowBody` in `packages/ui/src/primitives/list-row/list-row.tsx` drops `data-disabled`, `data-selected` and `aria-current`, while the `expand` branch of the props union still accepts them.

## Why

A caller that marks a disclosure row selected or disabled sees nothing happen and gets no type error.

## Done when

The branch honours both attributes, with a case in `tests/ui/primitives/list-row/disclosure.ct.tsx`, or the `expand` branch refuses them by type.

## Evidence

Filled at landing: what ran and where its output is.
