---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: ui
plan: cross-surface-consistency
---

# Portalled floats stay on top through a section swap

## What

A dialog, palette, popover or toast that sits over the captured region during a section swap is covered by the content snapshots for the fade, the same mechanism as the context sheet fix; ui-surface-and-interaction-rules §5.7 records that no checker holds the portalled floats.

## Why

A float that survives a swap vanishes for the length of the fade.

## Done when

A component test over each portalled float kind shows it on the swap's held first frame, or the floats take their own capture name.

## Evidence

Filled at landing: what ran and where its output is.
