---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# A compare block's state label wraps inside its block at enlarged text

## What

In the refinery session and execution results on a phone at 200% and 300% text, the state label of a compare block stays on one line and widens the results pane, which scrolls sideways. The block is `packages/ui/src/primitives/compare-blocks/compare-blocks.tsx` with its recipe in `packages/ui/src/primitives/compare-blocks/variants.ts`.

## Why

A results pane that scrolls sideways hides the state that says which version won.

## Done when

A component test in a new file under a new compare-blocks directory under `tests/ui/primitives/` mounts a compare block with a long state label in a 390px pane at 200% and 300% text. It asserts that the pane does not scroll sideways and the label wraps inside the block. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
