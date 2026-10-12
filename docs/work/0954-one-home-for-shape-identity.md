---
kind: work
status: open
updated: 2026-10-12
priority: P1
plan: test-foundation
---

# One home for shape identity

## What

Shape comparison lives once: the checker comparer in `floor/code-facts/assignability.ts` that item 932 started. `pnpm ast respell`, `contract-structural-copy`, `contract-derives-not-respells`, `test-hand-shape`, `baseui-derives-not-respells`, `test-production-clone` and `no-test-fabrication` call it; `verify/lib/inline-shape-declaration.ts` and any second comparer are deleted.

## Why

Several gates and `pnpm ast respell` each decide whether two shapes are the same, and they disagree.

## Done when

One comparer; every caller gate and `pnpm ast respell` call it; findings and `pnpm ast respell` output diffed before and after.

## Evidence

Filled at landing: what ran and where its output is.
