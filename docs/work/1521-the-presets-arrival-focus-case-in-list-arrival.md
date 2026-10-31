---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# The Presets arrival focus case in list-arrival-focus flakes under load

## What

tests/client/features/app-shell/surfaces/list-arrival-focus.ct.tsx "arriving in presets" failed in several lanes this session under load (the tab walk never reached a row), and passed alone each time; it has not been reproduced on a clean tree.

## Why

A flaky focus case hides a real arrival-order regression.

## Done when

The cause is named (a readiness signal the walk does not wait on, or a product focus race) and fixed with a real lifecycle signal; the case passes 30 of 30 repeated runs on Chromium under load.

## Evidence

Reproduced on the old test: `pnpm test:ct list-arrival-focus.ct.tsx -g "arriving in presets" --repeat-each=30 --workers=4` on Chromium failed 2 of 30; the walk reached New and the search field but no row (stops `[.., new, search]`, `row` absent).

Cause (test defect): the search field sits in `ListPage` above the library's `QueryBoundary`, so it exists while `preset.list` and `getUserSettings` are still suspended. The case waited only for band focus, so Tab left the pane before any row mounted. Chats and Characters resolve faster and masked it.

Fix: the case waits for the first `list-row-body` in the list pane before the walk. After it, `--repeat-each=30 -g "arriving in"` (all three sections, 90 runs, 4 workers, 1-min load 24 to 34) passed 90 of 90.
