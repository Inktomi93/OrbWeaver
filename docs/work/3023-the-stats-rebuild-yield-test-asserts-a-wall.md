---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: stats
plan: test-foundation
---

# The stats rebuild yield test asserts a wall-clock gap

## What

tests/server/domain/stats/persistence/rebuild-yields.int.test.ts measures the longest gap between immediates with performance.now and asserts it is under half a second. The same case also asserts a load-independent page count.

## Why

The test checklist bans wall-clock reads; a host under load can push the gap past the bound with no product change, so the case can fail for a reason the product does not own.

## Done when

The case asserts only the load-independent yield count (or an injected clock), and the gap assertion is gone.

## Evidence

Filled at landing: what ran and where its output is.
