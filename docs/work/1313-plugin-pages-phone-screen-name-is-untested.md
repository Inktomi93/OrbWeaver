---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: tests
plan: test-foundation
---

# The Plugin pages phone screen name is untested

## What

`useExtensionsSelectionTitle` (`packages/client/src/features/plugin/lib/use-extensions-selection-title.ts`) builds the phone screen name `Plugin pages · n` and suppresses a zero census. No test covers it; its only cover was the AR8 e2e row, dropped in item 0963 because e2e would have to copy the page join.

## Why

A regression in the title composer would ship silently on the phone.

## Done when

A CT over the production extensions section, or the AR16 title-composer case in 0963 leg C, asserts the non-zero, zero and `0 of N` arms, with a control that fails on a planted composer defect.

## Evidence

- The composer is `censusTitle` (`packages/client/src/lib/census-title.ts`), which `useExtensionsSelectionTitle` and the other section title hooks now call. Before, the extensions hook suppressed only a numeric zero.
- `pnpm test tests/client/lib/census-title.dom.test.ts`: 2 passed. The cases assert `Plugin pages · 2`, `Plugin pages · 2 of 330` and `Plugin pages · 0 of 5`, and a null title for `0` and an unread census. A string census is always a filtered `n of m`, so the composer has no arm for a bare `"0"`.
- Control: the composer without its zero arm failed the zero case with `expected 'Plugin pages · 0' to be null`; reverted.
