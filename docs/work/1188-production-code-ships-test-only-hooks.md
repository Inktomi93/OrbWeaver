---
kind: bug
status: open
updated: 2026-10-20
priority: P2
plan: test-foundation
---

# Production code ships test-only hooks

## What

Client state and data modules export test hooks such as \_\_setFrameSchedulerForTest (packages/client/src/state/chat-stream.ts:109), \_\_readMessageEditDraftForTest, \_\_resetSelection, \_\_resetPresetSelection, \_\_resetRecentSteers and \_\_resetSessionFreshness (packages/client/src/data/session-freshness.ts:97), each imported only by legacy tests. The full list is in reports/review/legacy-kept-alive-audit.md.

## Why

Spine-Testing section 10 and the test-mirror plan forbid production code shaped to serve a legacy harness; a test seam belongs at the composition root as an injected edge.

## Done when

Each hook is replaced by an injected seam (clock, scheduler, store reset through the composed root) used by a rebuilt test, or deleted with the legacy test it served; no production export is named or used only for tests; a lint or knip rule refuses a new \_\_ or ForTest production export.

## Evidence

Filled at landing: what ran and where its output is.
