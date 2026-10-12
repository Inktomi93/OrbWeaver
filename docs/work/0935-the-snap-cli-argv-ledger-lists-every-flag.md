---
kind: bug
status: open
updated: 2026-10-12
priority: P2
area: tooling
---

# The snap CLI argv ledger lists every flag the executable descriptors accept

## What

tests/tooling/snap/ops/cli-truth.suite.int.test.ts fails on main (803f66c503) on durable accepted-flag ledger matches every executable descriptor grammar: the argv audit ledger beside tooling/src/snap/ops/ lacks --stage-db, --long-press, --swipe-x, --tap-at and --soft-keyboard, which the executable descriptors accept. Reproduced by the 929 lane in a clean worktree at main.

## Why

A red suite on main hides new failures in the snap CLI, and an argv ledger that misses accepted flags no longer proves the CLI surface.

## Done when

The ledger names every accepted flag or the suite derives it, and cli-truth.suite.int passes on main.

## Evidence

Filled at landing: what ran and where its output is.
