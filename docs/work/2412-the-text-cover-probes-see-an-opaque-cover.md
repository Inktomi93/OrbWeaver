---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# The text-cover probes see an opaque cover that ignores the pointer

## What

The design-audit walker finds covers over a text by hit-testing probe points, so an opaque layer with pointer-events:none is invisible to them; text under it is judged against that layer's pixels as if it were the backdrop, which can file a false contrast finding.

## Why

Decorative overlays commonly set pointer-events:none, and a cover the probes cannot see turns into a wrong backdrop.

## Done when

Cover detection includes layers that ignore the pointer (by paint-order walk rather than hit test, or by an elementsFromPoint pass that keeps them), with a fixture of text under an opaque pointer-events:none layer that is excluded as covered and a control that still judges uncovered text.

## Evidence

Filled at landing: what ran and where its output is.
