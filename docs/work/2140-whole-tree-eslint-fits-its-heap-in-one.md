---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Whole-tree ESLint fits its heap in one process

## What

One pnpm lint:eslint run over packages, tooling and tests aborted with JavaScript heap out of memory on main, while the same three trees passed when linted one at a time. Pre-push runs pnpm lint:eslint over the whole tree in one process.

## Why

If the single-process run exceeds the default heap on a contributor box or a CI runner, pre-push and CI fail with no lint verdict.

## Done when

The peak heap of a whole-tree pnpm lint:eslint run is measured on main, and it stays inside the default heap with headroom, or the run is split by world so each process fits, with no raised heap limit.

## Evidence

Filled at landing: what ran and where its output is.
