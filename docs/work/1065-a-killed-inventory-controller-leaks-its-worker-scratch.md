---
kind: bug
status: open
updated: 2026-10-18
priority: P3
area: tooling
plan: test-foundation
---

# A killed inventory controller leaks its worker scratch directory

## What

When the semantic-inventory controller is killed, its finally block never runs, so the orb-native-inventory-worker-\* scratch directory is left behind (tooling/src/floor/compiler/semantic-inventory-worker-run.ts around lines 21 and 42). Found by claude-b's 1055 lane; it predates 1055.

## Why

Each killed run leaves scratch data on disk, and repeated stops accumulate it.

## Done when

The scratch directory is removed when the supervised worker is stopped or its controller dies, or it is created under a location that the next run sweeps, with a test that kills a controller and asserts no directory survives.

## Evidence

Filled at landing: what ran and where its output is.
