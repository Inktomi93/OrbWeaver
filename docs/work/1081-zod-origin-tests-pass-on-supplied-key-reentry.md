---
kind: tooling
status: open
updated: 2026-10-19
priority: P3
area: tooling
plan: test-foundation
---

# zod-origin tests pass on supplied-key reentry and the env parser

## What

tests/tooling/floor/code-facts/zod-origin.test.ts fails two cases on main: supplied-key reentry, and the actual env parser AUTH_MODE case, which cites a prototype exposure in packages/contracts/src/inference/wire-subset.ts:601.

## Why

The zod origin facts feed native placement and shape gates; a red proof hides a regression.

## Done when

Both cases pass for a stated cause, or each case is revised with a ruling.

## Evidence

Filled at landing: what ran and where its output is.
