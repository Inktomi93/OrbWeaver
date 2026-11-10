---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: client
plan: cross-surface-consistency
---

# The preset actions readout prints a raw on/off wire word

## What

packages/client/src/features/preset/components/readout/actions-readout.tsx prints the wire spelling on or off in a chip where the appearance display map has the words On and Off.

## Why

A chip that prints a wire spelling breaks the rule that built-in values show their display word.

## Done when

The chip reads the display word from its map, and the copy:chip rawWire column lists no defect.

## Evidence

Filled at landing: what ran and where its output is.
