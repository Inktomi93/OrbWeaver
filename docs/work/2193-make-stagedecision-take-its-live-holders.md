---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Make stageDecision take its live holders

## What

stageDecision in tooling/src/snap stage-bands.ts still takes liveHolders as optional, although the census path now requires it.

## Why

A caller that omits the holders gets a decision built on an empty holder list.

## Done when

liveHolders is required at stageDecision and every caller passes it, with typecheck as the proof.

## Evidence

Filled at landing: what ran and where its output is.
