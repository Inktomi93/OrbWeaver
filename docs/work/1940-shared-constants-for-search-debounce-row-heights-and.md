---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-a53049a5655c3c496
plan: cross-surface-consistency
---

# Shared constants for search debounce, row heights and the pixel epsilon

## What

Give the search debounce, the estimated row heights and the one pixel epsilon one home each. Constants that only share a number with a different meaning stay local, as coded keeps in the census.

## Why

These repeat one meaning across surfaces.

## Done when

Each has one home, and the census reports no repeat of them.

## Evidence

- Search debounce: `SEARCH_DEBOUNCE_MS` in `packages/client/src/lib/use-debounced-value.ts` is the one home, and every search field reads it. The other settle constants (rerank, schema plan, autosave, jump settle) are different delays and stay.
- Row heights: `ESTIMATED_ROW_PX` in `packages/client/src/lib/row-estimates.ts` is one table with a step per row anatomy. Ten lists read it; the value each list used is the step it took, so no first paint changes.
- Pixel epsilon: the layout slack of one pixel is `LAYOUT_SUBPIXEL_PX` in the testkit. Twelve suites read it in place of their own copy of one. `SCROLL_EDGE_EPSILON_PX` and `WRITE_EPSILON_PX` name different tolerances and stay.

The moves ran through the new `local-constant-to-import` codemod (fixtures for a move, a file the plan does not list, and a shadowed name). Each dry run listed the files an independent `rg` listed, and a rerun changed nothing. The coincidence keep for `ESTIMATED_ROW_PX` is removed from `tooling/src/ui-facts/hand-code.ts`, and `pnpm ui-facts --only=hand-rolling` reports zero repeated constants.
