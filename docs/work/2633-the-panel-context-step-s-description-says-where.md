---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: ui
plan: cross-surface-consistency
---

# The panel context step's description says where the focal stone is reached

## What

The token description for the panel context step in packages/ui/src/tokens/tokens.json promises the focal stone on a mid-width desktop. The stone is read from the band's inner width, which is narrower than the pane, and is one step smaller there. Ruling: the description is corrected to the render; the stone is not promoted at that width, because that would push the set band past its ceiling on a short window.

## Why

A token description the render contradicts misleads the next change to that step.

## Done when

The description states the width at which the band's inner box reaches the focal step, and a component test reads the stone size on both sides of it.

## Evidence

Filled at landing: what ran and where its output is.
