---
kind: decision
status: open
updated: 2026-09-23
priority: P2
area: verify
---

# Decide the time budget and home for type-aware real-corpus liveness pins

## What

Decide where the real-corpus pins for `analysis: "types"` policies run. One type-graph corpus over `@client` pushed the existing suite past the integration timeout. Options: one shared type-graph corpus in its own `.repo.int` file with its own budget; that file in `--full` only; or per-family files. Recommended default: one shared corpus, its own file, run in `--full`.

## Why

Item 0042 cannot finish the type-aware policies until this is ruled. The mechanism already supports `types: true`; only the schedule is open.

## Done when

The ruling is recorded here, and the type-aware pins in item 0042 follow it.

## Evidence

Filled at landing: what ran and where its output is.
