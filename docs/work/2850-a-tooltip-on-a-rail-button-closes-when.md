---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# A tooltip on a rail button closes when keyboard focus moves to another control

## What

A review reports a rail tooltip that stays open after focus moves away from its button. The report is unconfirmed. The tooltip primitive is `packages/ui/src/primitives/tooltip/tooltip.tsx`. The same class of report says a tooltip on the New character button stays over the sort control after the side panes dock, and the review could not tell the app from the screenshot tool's panel action.

## Why

A tooltip left open over a neighbouring control hides what the person is about to use.

## Done when

A component test in `tests/ui/primitives/tooltip/` focuses a button by keyboard until its tooltip shows, moves focus to another control, and asserts the tooltip closes. If it passes on the current code it stays as the recorded answer and the item closes with that result. If it fails, the primitive is fixed and the test is red before and green after.

## Evidence

Filled at landing: what ran and where its output is.
