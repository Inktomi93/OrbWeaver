---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# The lenient card reading rescans a failing run once per opening line

## What

`tryLenientBlock` in `packages/kit/src/content/index.ts` rescans to the end of the run for every block-opening line when the element-majority test fails. On text shaped to fail it repeatedly the cost grows with the square of the line count. It applies where lenient HTML is on, and `tests/kit/content/linear-scans.test.ts` has no row for it.

## Why

A long reply shaped this way can stall a reader's tab in a room with lenient HTML on.

## Done when

The lenient reading makes one pass per run, and the linear-scans test has a row that fails on the old cost.

## Evidence

Filled at landing: what ran and where its output is.
