---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# A hint popup's text wraps inside the popup at enlarged text

## What

In the persona editor dialog on a phone at 300% text, a hint popup scrolls sideways because its own text does not break. The hint is built in `packages/ui/src/primitives/hint-trigger/hint-trigger.tsx` and `packages/ui/src/primitives/hint-trigger/variants.ts`.

## Why

A hint that scrolls sideways cannot be read whole where it is opened to explain a control.

## Done when

A component test in a new file under a new hint-trigger directory under `tests/ui/primitives/` opens a hint with a long unbroken string in a 390px viewport at 300% text. It asserts that the popup does not scroll sideways and its text lies inside the popup. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
