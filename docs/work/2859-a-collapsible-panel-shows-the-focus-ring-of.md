---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: ui
plan: cross-surface-consistency
---

# A collapsible panel shows the focus ring of a control at its edge

## What

At 200% text on a phone, the focus ring of a picker that sits flush with an open collapsible panel's edge is cut on the right, because the panel hides its overflow. The panel recipe is in `packages/ui/src/primitives/collapsible/variants.ts`.

## Why

A focus ring cut on one side is hard to see for a keyboard user.

## Done when

A component test in a new file under a new collapsible directory under `tests/ui/primitives/` focuses a control flush with the inline edge of an open panel at 390px wide and 200% text. It asserts that the focus ring's box lies inside the panel's clip box on every side while the open and close height transition still hides content. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
