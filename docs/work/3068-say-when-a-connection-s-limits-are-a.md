---
kind: work
status: open
updated: 2026-11-14
priority: P1
area: connection
---

# Say when a connection's limits are a guess and ask for the real ones

## What

When a connection has no reported or known limits, it falls back to `GENERATION_FLOOR` in `packages/contracts/src/inference/capability/generation.ts` (8,192 context, 4,096 output) and marks them assumed. Tell the user at the moment the connection is added that the limits are assumed, and let them enter the real context window and max output there.

## Why

A user on a 1M-context model gets history trimmed to 8k and finds the cause only by reading an (assumed) label in Advanced.

## Done when

Adding a connection with assumed limits shows that fact and takes the real numbers in the same flow, and a CT pins it.

## Evidence

Filled at landing: what ran and where its output is.
