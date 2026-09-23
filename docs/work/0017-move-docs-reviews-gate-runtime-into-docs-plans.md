---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: docs
plan: doc-migration
---

# Move docs/reviews/gate-runtime into docs/plans/gate-runtime and re-point its two readers

## What

Create a plan named gate-runtime with `pnpm doc new plan gate-runtime`, and move the files of
docs/reviews/gate-runtime/ into it. Re-point the two tools that read that folder:
tooling/src/verify/ops/gen/read-first-costs.ts and tooling/src/verify/ops/ledgers-fresh-rollup.ts.
Rewrite the moved files' citations of the old census path and of the deleted registry.

## Why

The folder is the working set of a live program, so it belongs in a plan, not in reviews. It is also
the last reason `LEGACY_ROOTS` keeps a `reviews` row.

## Done when

docs/reviews/ no longer exists. `pnpm check:ledgers-fresh` and `pnpm check:structure` are green.
`LEGACY_ROOTS` has no `reviews` row.

## Evidence

Filled at landing: what ran and where its output is.
