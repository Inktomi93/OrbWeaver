---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: ui
plan: surface-walk
---

# The combobox input holds a bare title-floor minimum that outgrows a phone at the largest text

## What

The combobox input in `packages/ui/src/primitives/combobox/variants.ts` sets its minimum inline size to the title floor token, a rem length, with no clamp to its container. At the largest browser text that length is wider than a phone pane, so a combobox there would run past it. Not yet verified at enlarged text.

## Why

The list row title carried the same shape and pushed phone panes sideways.

## Done when

A component test mounts a production combobox in a phone-width pane at the largest browser text and shows the input inside its container, red on the current input, and the minimum yields to the container with the floor kept at normal sizes.

## Evidence

Filled at landing: what ran and where its output is.
