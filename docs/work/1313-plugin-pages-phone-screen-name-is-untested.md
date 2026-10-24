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

Filled at landing: what ran and where its output is.
