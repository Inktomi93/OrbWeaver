---
kind: bug
status: open
updated: 2026-11-14
priority: P1
area: security
---

# The macro neutralizer leaves a live opener in a run of three braces

## What

`neutralizeMacros` in `packages/kit/src/macro/content.ts` rewrites braces in pairs that do not overlap, so a run of three opening braces still holds a live macro opener. Every caller inherits it: the plugin lore write in `packages/server/src/domain/plugin/substrate/bridge.ts`, plugin macros, the automation route for model text, and the databank slot. A document holding a macro wrapped in three braces was evaluated on the host's turn and wrote a room variable.

## Why

Text from a plugin, a model or another account can run macros in the host's turn, which the neutralizer exists to prevent.

## Done when

The neutralizer breaks every brace that is followed by the same brace and leaves an exact pair's output unchanged. A kit case asserts through the evaluator that runs of two to five braces evaluate nothing, and each caller has a three-brace case through its production door.

## Evidence

Filled at landing: what ran and where its output is.
