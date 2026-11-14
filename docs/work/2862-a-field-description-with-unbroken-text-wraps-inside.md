---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# A Field description with unbroken text wraps inside its row

## What

On Settings, Chat behavior at 300% text on a phone, a Field description whose own text cannot break pushes the settings column sideways. The description slot in `packages/ui/src/primitives/field/variants.ts` sets a prose measure but no word-wrap rule and no zero minimum width.

## Why

A settings column that scrolls sideways has stopped reflowing and hides the end of its descriptions.

## Done when

A component test in `tests/ui/primitives/field/` mounts a Field whose description holds a long unbroken value in a 390px pane at 300% text. It asserts that the pane does not scroll sideways and that the description's right edge lies inside the pane. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
