---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: client
---

# The group Advanced section stays open across a rail round-trip

## What

The group config form's Advanced section collapses after leaving and returning via the rail (found by the cb-client-polish side-eye, pre-existing).

## Why

Users lose their place in a long settings form.

## Done when

Advanced keeps its open state across a rail round-trip; a CT covers it.

## Evidence

The fold's open state now lives in the persisted config disclosure store (`packages/client/src/state/config-group-open-store.ts`, `foldOpenIds`), read in `GroupBody` (`config-content-surface.tsx`).

- `pnpm test:ct tests/client/features/config/surfaces/config-content-surface.ct.tsx`: the new rail round-trip test failed on the old local `useState` (expanded stayed `false` after remount); all 4 pass after the change.
- `pnpm typecheck` and `pnpm lint:eslint` on the changed files are clean.
