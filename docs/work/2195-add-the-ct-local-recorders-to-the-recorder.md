---
kind: bug
status: doing
updated: 2026-11-13
priority: P3
area: tests
lane: wt/agent-a1b41287df1811879
plan: test-enforcement
---

# Add the CT local recorders to the recorder name list

## What

The recorder rule in `tooling/src/eslint/test-recorders.ts` does not know the CT-local recorder names `asked`, `sent` and `saved`. Adding them turns five live sites red, each reading the last entry of an async recorder inside a poll: `tests/client/features/app-shell/components/background-upload.ct.tsx`, `tests/client/features/discovery/surfaces/corpus-browse-setting.ct.tsx`, `tests/client/features/discovery/surfaces/corpus-search-controls.ct.tsx` and `tests/tooling/snap/ops/arms/motion.test.ts`. Rewrite those reads first: the CT sites poll the whole list for the expected entry, and the motion test asserts the whole sent list.

## Why

A tail read on those recorders is not refused.

## Done when

The five sites assert the whole list, the names join the rule, a CT plant row with each is refused, and ESLint over the tests is clean.

## Evidence

Filled at landing: what ran and where its output is.
