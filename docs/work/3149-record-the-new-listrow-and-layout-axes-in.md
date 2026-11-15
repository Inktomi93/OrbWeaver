---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Record the new ListRow and layout axes in the density law

## What

`docs/law/UI-Density-Law.md` lists `minWidth` on Row and Stack only and ListRow with `receded` and `align`; Grid and Container `minWidth` and ListRow `expand`, `detail` and `rail` have no row.

## Why

A primitive axis the law does not list is an axis a reviewer cannot hold a site to.

## Done when

Rows added where the law lists each primitive's axes, and `pnpm test:tools tests/tooling/doc/ops/check.int.test.ts` passes.

## Evidence

Filled at landing: what ran and where its output is.
