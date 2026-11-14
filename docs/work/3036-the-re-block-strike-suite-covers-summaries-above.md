---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: test-foundation
---

# The re-block strike suite covers summaries above the first tier

## What

`tests/server/domain/chat/memory/memory-strikes-reblock.int.test.ts` re-slices a room whose strikes and summaries sit at the first tier. No composed case changes the block size in a room that holds higher-tier summaries over a struck span; the kit cases in `tests/kit/recall/strikes.test.ts` cover the rule for them.

## Why

A change to how a higher tier resolves its span could return a struck scene through a rollup with every composed case passing.

## Done when

A composed case builds a second-tier summary over a struck span, changes the block size, rebuilds, and shows the struck scene absent from a forced-turn prompt at both tiers.

## Evidence

Filled at landing: what ran and where its output is.
