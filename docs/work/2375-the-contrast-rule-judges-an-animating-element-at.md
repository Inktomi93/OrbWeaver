---
kind: tooling
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# The contrast rule judges an animating element at its resting opacity

## What

The design-audit contrast check (tooling/src/ui-audit/lib/checks-color.ts) judges a sample caught mid opacity animation, such as the members row's pulsing responding mark at 0.587 opacity, even though the sample records opacityTransitions.

## Why

A finding from one frame of a pulse is noise beside the real low-contrast text.

## Done when

A sample with an opacity animation is judged at its resting opacity or recorded as excluded with that reason, a fixture shows a pulsing mark read at rest, and a statically dimmed low-contrast text still fails.

## Evidence

Filled at landing: what ran and where its output is.
