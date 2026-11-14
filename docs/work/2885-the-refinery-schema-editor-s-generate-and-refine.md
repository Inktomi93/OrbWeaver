---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# The refinery schema editor's Generate and Refine rows keep their fields at enlarged text

## What

In `packages/client/src/features/refinery/components/schema-editor-dialog.tsx` the Generate and Refine rows grow a Field inside a Row that does not wrap, so the field collapses beside its button at enlarged text. `Field` has a `floor` prop for this. The refinery components also pass `data-testid` to `Stack`, which does not forward it; the refusal note, the schema editor panes and the forge note carry such dead attributes.

## Why

A field too narrow to show what was typed cannot be used, and an attribute that never reaches the page misleads the next author of a test.

## Done when

A component test on the production schema editor shows both fields at or above their floor at enlarged text on a phone, red before and green after, and no refinery component passes a test id to a primitive that drops it.

## Evidence

Filled at landing: what ran and where its output is.
