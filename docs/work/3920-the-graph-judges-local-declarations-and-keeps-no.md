---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# The graph judges local declarations and keeps no fixed token limit

## What

The graph never judges a local function or class declaration, though tsc reports both as unused (tooling/src/unwired/graph/sites.ts:1150). tooling/src/unwired/graph/css.ts:61 MAX_TOKEN is a fixed limit on the graph path. A JSDoc at graph/state.ts:141 is detached from its declaration, and a comment at graph/worlds.ts:56 describes a set that was deleted. Found by the graph-core review.

## Why

Each scan has to see every declaration kind tsc sees, and a fixed limit cuts a walk at an arbitrary point instead of where the data ends (owner ruling against hardcoded limits).

## Done when

Local function and class declarations are judged like local bindings, with a planted case each; MAX_TOKEN is replaced by a seen-set or the data's own end, with a case past the old limit; the stray JSDoc and comment are fixed.

## Evidence

Filled at landing: what ran and where its output is.
