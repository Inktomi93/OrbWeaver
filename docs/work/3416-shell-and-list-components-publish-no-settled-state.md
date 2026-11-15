---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: tests
plan: test-foundation
---

# Shell and list components publish no settled state for tests to wait on

## What

Some component and e2e tests still guess when a layout has settled, because the component publishes nothing to wait on. The topbar's inline or overflow fold in `shell-topbar.tsx` (read by `app-shell-topbar.ct.tsx`, `corpus-archetypes-names.ct.tsx` and `openPane` in `context-tab-bodies.ct.tsx`). The list pane header's action overflow (retried with `toPass` in `app-shell-modals.ct.tsx`). The settings read in `toggleAndReload` in `tests/e2e/corpus-settings.spec.ts`. The content-floor flag in `use-is-mobile-viewport.ts`, which is never rendered while the context pane is collapsed.

## Why

These tests can act before the layout settles and fail on a slow runner, which is the pattern that broke CI on the title reveal, the restore and the text scale grid.

## Done when

Each component publishes its settled state as an attribute or ARIA state, each named test waits on it with a web-first assertion, and a planted break of each attribute turns its test red.

## Evidence

Filled at landing: what ran and where its output is.
