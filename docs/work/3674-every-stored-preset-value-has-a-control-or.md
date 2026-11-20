---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: preset
plan: cross-surface-consistency
---

# Every stored preset value has a control or a reason, and fault capture records what was sent

## What

A stored carryReasoning value has no editor control, and captureTurnFault records the per-send effort before the capability projection, so the debug ring can show a value that was never sent.

## Why

A stored value a user cannot see or change, and a debug record that disagrees with the wire, both mislead.

## Done when

carryReasoning has a control where the model can use it or is ruled out of presets with its reason, and fault capture records the projected effort, with a test.

## Evidence

Filled at landing: what ran and where its output is.
