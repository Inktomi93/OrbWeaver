---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
plan: cross-surface-consistency
---

# Keep the rule row's state lines phrasing content inside its button body

## What

`packages/client/src/features/automation/components/rule-row-state.tsx` renders a `Row` div and `Text` paragraphs, and the rule row places them in the ListRow `detail` slot inside its disclosure button.

## Why

A button holds phrasing content only, and the `detail` slot's own contract in `packages/ui/src/primitives/list-row/list-row.tsx` says phrasing content.

## Done when

The state lines render as spans in the row's detail, and a DOM-nesting assertion on the rule row finds no block element inside its button.

## Evidence

Filled at landing: what ran and where its output is.
