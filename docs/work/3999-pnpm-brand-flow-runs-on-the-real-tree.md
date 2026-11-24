---
kind: bug
status: open
updated: 2026-11-24
priority: P1
area: tooling
---

# pnpm brand-flow runs on the real tree under the memory bar

## What

A whole-tree pnpm brand-flow run aborted with a Node heap out-of-memory at the 16 GB heap (exit 134), so the brand sweep in 3913 cannot be measured. brand-flow has no profiler: the unwired verbs' --profile (wall, cpu, heap, both processes' peaks, Node heap by allocating function) does not reach it.

## Why

The owner set 32 GB as the bar for this tool too and wants every run measured with the TypeScript 7.1 profiler and heap profile, so a crash names what grew.

## Done when

pnpm brand-flow takes the shared --profile option, its compiler runs under the 32 GiB limit, a profiled whole-tree run on main finishes with both processes' combined peak under 32 GB, the retainer that grew is named from the heap profile, and 3913's done criterion can be measured.

## Evidence

Filled at landing: what ran and where its output is.
