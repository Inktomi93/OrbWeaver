---
kind: bug
status: open
updated: 2026-10-21
priority: P2
plan: test-foundation
---

# Production code ships test-only hooks

## What

Adjudicate client test-only exports in their owning replacement cases: \_\_setFrameSchedulerForTest, \_\_readMessageEditDraftForTest, \_\_resetSelection, \_\_resetPresetSelection, \_\_resetRecentSteers and \_\_resetSessionFreshness.

## Why

Production should expose real composition edges rather than legacy-only reset and inspection APIs.

## Done when

Delete unused hooks. Where a selected rebuilt case needs controlled scheduling or state, inject the dependency through production composition and prove the behavior.

## Evidence

Definitions remain in client state modules and `packages/client/src/data/session-freshness.ts`. Recheck direct and computed consumers before deleting; an unused hook does not justify a replacement abstraction.
