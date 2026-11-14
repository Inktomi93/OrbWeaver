---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: ui
plan: cross-surface-consistency
---

# A wrapped Select value keeps air against the trigger's top and bottom edges

## What

Once a hug-wrap Select value wraps to a second line, its first line sits close to the trigger's border, because the trigger has no block inset. `packages/ui/src/primitives/select/variants.ts` sets `py-0` on the `hugWrap` trigger and relies on the step height to centre a single line.

## Why

A wrapped value that touches its border reads as cramped next to a single-line value in the same control.

## Done when

A component test in `tests/ui/primitives/select/` mounts a hug-wrap Select whose value wraps at 390px wide and 200% text. It asserts that the gap from the text to the border matches the gap of a single-line value in the same trigger, and that a single-line value still lands exactly on its step height. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
