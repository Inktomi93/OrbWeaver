---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: preset
plan: cross-surface-consistency
---

# The window floor note says what goes out when the trained maximum is below the floor

## What

windowFloorRaises in packages/contracts/src/inference/capability/reads.ts makes the Output section say the 2048 floor goes out even when the model's trained maximum is lower, which may not be what is sent. Found by reading the code, not run.

## Why

The note exists to say what the model really receives.

## Done when

The note states the value actually sent when the trained maximum is below the floor, with a CT for that case.

## Evidence

Filled at landing: what ran and where its output is.
