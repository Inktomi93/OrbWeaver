---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: client
plan: cross-surface-consistency
---

# A phone list snapshot can paint over a live context sheet during a section swap

## What

The phone list that is the screen now carries a view transition name. The reviewer of that change suspected that a section swap started while the context sheet is open draws the old list snapshot above the sheet for the length of the fade. It is not reproduced.

## Why

A sheet the reader is using would be covered for a moment by the screen behind it.

## Done when

A component test opens the context sheet on a phone size, swaps section, and asserts the sheet stays on top through the transition, or the item is closed with the run that shows it cannot happen.

## Evidence

Filled at landing: what ran and where its output is.
