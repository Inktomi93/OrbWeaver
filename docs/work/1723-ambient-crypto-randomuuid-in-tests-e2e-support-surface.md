---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: tests
plan: test-foundation
---

# Ambient crypto.randomUUID in tests/e2e/support/surface-sections.ts and surface-chat.ts: seed it from the run's id source or record why e2e may use it

## What

Seed the ambient `crypto.randomUUID` calls in `tests/e2e/support/surface-sections.ts` and `tests/e2e/support/surface-chat.ts` from the run id source, or record the reason an e2e support file may use them. The same call also appears in `tests/e2e/support/modes.ts` and `tests/e2e/support/sse.ts`; decide those in the same pass.

## Why

Those files mint names with crypto.randomUUID, outside the run's id source. Other tests draw their ids from that source, so a run's names cannot be replayed from its seed.

## Done when

No call to crypto.randomUUID remains in those two files, or a comment beside each call cites the ruling that permits it.

## Evidence

Filled at landing: what ran and where its output is.
