---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: preset
plan: cross-surface-consistency
---

# On a phone the Max context box clips a large value

## What

At phone width the Max context tokens box is narrower than a seven-digit value, so the last digit is cut at the box edge.

## Why

The user cannot read the number they typed, which is the number the capped note talks about.

## Done when

The box fits the largest accepted value at phone width, or the value is grouped and shortened, with no horizontal overflow in the input.

## Evidence

Filled at landing: what ran and where its output is.
