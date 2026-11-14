---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# Imagine mode toggles wrap inside the dialog at enlarged text

## What

In the Imagine dialog on a phone at 300% text, the Background and Free prompt mode toggles paint past the dialog's right edge. The mode group is in `packages/client/src/features/imagery/components/imagine-body.tsx` and its recipes are `packages/ui/src/primitives/toggle-group/variants.ts` and `packages/ui/src/primitives/toggle/variants.ts`, where a mid-word break is an opt-in axis.

## Why

A mode that cannot be seen whole cannot be chosen with confidence before a paid image request.

## Done when

A component test in `tests/client/features/imagery/components/` opens the Imagine dialog at 390px wide and 300% text. It asserts that every mode toggle lies inside the dialog body. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
