---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: client
---

# Comments cite a render-error gate that no longer runs

## What

Four comments name a gate that D333 removed: `packages/client/src/data/query-error-state.tsx`, `packages/client/src/features/chat/surfaces/message-list-surface.tsx`, `packages/client/src/features/config/surfaces/config-content-surface.tsx`, `packages/client/src/features/discovery/components/corpus-readiness-rail.tsx`. The convention they protect still holds (the error state renders `QueryErrorState` directly, never a wrapper), but no check runs under that name.

## Why

A cold reader trusts a check that does not run and skips the review the convention now relies on.

## Done when

Each comment states the convention and, where one exists, the test that asserts it, without naming a gate that does not run; an `rg` for the gate name across `packages` and `tests` finds nothing.

## Evidence

Filled at landing: what ran and where its output is.
