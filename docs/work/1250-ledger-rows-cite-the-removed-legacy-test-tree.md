---
kind: work
status: open
updated: 2026-10-23
priority: P2
area: docs
---

# Ledger rows cite the removed legacy test tree

## What

`pnpm test:tools tests/tooling/doc/ops/check.int.test.ts` (the governed-docs check) is red: ADR rows under `docs/adr/` still cite `tests/legacy/...` paths and other files that no longer exist (0013, 0071, 0107, 0121, 0129, 0136, 0137 and more), and item 0989 is a `doing` item with no lane named. The code-side citation sweep (item 1235) covered `packages`, `tooling` and `tests` but not `docs/`.

## Why

A ledger row that points at a deleted test has lost its proof; the doc check exists to catch exactly this and is red until the rows are repointed.

## Done when

Every dead citation in `docs/adr/**`, `docs/law/**` and `docs/plans/**` points at the maintained test that proves the same ruling, or the citation is removed and the row records that the proof is a restoration-register entry; 0989 names its lane or returns to open; `pnpm test:tools tests/tooling/doc` green; `rg -n 'tests/legacy' docs` prints nothing.

## Evidence

Filled at landing: what ran and where its output is.
