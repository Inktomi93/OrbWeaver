---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# A collapsible trigger's label wraps inside its row

## What

On Settings, the Customize this look disclosure and the reversible-setting disclosure, and in the categorized library, the trigger's label stays on one line at enlarged text and pushes its pane sideways. The trigger recipe is `packages/ui/src/primitives/collapsible/variants.ts`.

## Why

A disclosure that cannot fit its label hides the control that opens a whole section.

## Done when

A component test in a new file under a new collapsible directory under `tests/ui/primitives/` mounts a trigger with a long label in a 390px pane at 200% and 300% text. It asserts that the label wraps, the trigger stays inside the pane and the pane does not scroll sideways. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
