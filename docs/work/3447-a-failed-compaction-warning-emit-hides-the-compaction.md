---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A failed compaction warning emit hides the compaction error

## What

`fireManagedCompaction` in `packages/server/src/domain/chat/engine/engine.ts` awaits `emitBackground` in its catch before it rethrows, so an emit failure replaces the compaction error the outer catch logs.

## Why

The cause of a failed compaction can reach no log.

## Done when

The emit runs through `Promise.allSettled` as the memory path does, the compaction error is the one logged, and a test fails the emit and asserts the logged cause.

## Evidence

Filled at landing: what ran and where its output is.
