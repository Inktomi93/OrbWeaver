---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# A Field's control column never exceeds the popup or pane that holds it

## What

In popovers on a phone at enlarged text, a horizontal Field keeps a control column sized in rem, so the character Look colour pickers, the Context tab popups and the group room Context popup scroll sideways. The column is sized in `packages/ui/src/primitives/field/variants.ts` and only stacks under a container query, while `packages/ui/src/primitives/popover/popover.tsx` declares no size container for the popup.

## Why

A popup that scrolls sideways hides part of its own fields.

## Done when

A component test in `tests/ui/primitives/field/` mounts a horizontal Field inside a Popover popup at 390px wide with 200% and with 300% text. It asserts that the popup's scroll width equals its client width and that the control column's width does not exceed the popup's inner width. It is red before the change and green after. The fix lives in the Field or popup recipe, not in a call-site class.

## Evidence

Filled at landing: what ran and where its output is.
