---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: cross-platform
---

# No single lint program needs more than the smallest runner's memory

## What

The client, tests-node, tests-dom and server lint parts each load one TypeScript program whose peak memory is above the smallest hosted runner's. `scripts/eslint-parts.ts` holds the part table.

## Why

A runner with less memory than one program swaps or aborts, so the contributor workflow is slow or red on it.

## Done when

Each of those parts is split, by project references so pieces consume declarations, its peak fits the smallest runner, and the lint findings are unchanged. Start it only if the contributor workflow is still slow after the per-world split.

## Evidence

Filled at landing: what ran and where its output is.
