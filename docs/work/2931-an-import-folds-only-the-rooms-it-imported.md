---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: stats
---

# An import folds only the rooms it imported through the rebuild's own fold

## What

After an import run, stats move through the rebuild's own scans and fold over the imported rooms only, as `packages/server/src/domain/stats/persistence/retire-canon.ts` already does for rooms that leave or re-enter scope. No second formula, ever: the import adds the imported rooms' counts and spend through the same fold the rebuild uses, and the full-library rebuild stays until this lands.

## Why

Each import run scans the owner's whole library today, so its cost grows with the library instead of with the import.

## Done when

Live equals a rebuild after an import on every grain, and the import's stats cost grows with the imported rooms, not the library.

## Evidence

Filled at landing: what ran and where its output is.
