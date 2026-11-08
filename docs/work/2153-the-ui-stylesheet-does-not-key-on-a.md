---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: ui
lane: wt/agent-a7572929e5e574748
plan: cross-surface-consistency
---

# The ui stylesheet does not key on a client-only attribute

## What

packages/ui/src/styles/primitives.css keys a rule on \[data-reserve-key], an attribute only the client's QueryBoundary writes. Move the rule into a Stack reserve variant so the ui package owns both sides.

## Why

A ui rule that depends on a client attribute couples the packages in the wrong direction, and the rule breaks silently if the client renames it.

## Done when

No ui stylesheet selector names an attribute only the client writes, the picker door row still collapses under the stacked dialog, and the skeleton reservation CT passes.

## Evidence

Filled at landing: what ran and where its output is.
