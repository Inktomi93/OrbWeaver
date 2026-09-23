---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: docs
plan: doc-migration
---

# Reviews leave docs

## What

Delete `docs/reviews/` and `docs/history/reviews/` (agent run output: stickler, side-eye, verifier and audit records), except a file a gate reads by path, which moves next to its reader under `tooling/src/verify/` (the population file has its own item). Rewrite or drop every citation: the 296 code sites that cite `docs/reviews/` or a history path, the `docs/design/**` links, the `dangling-refs` corpus derivation, the formatter's living-tree list in `tooling/src/doc-catalog/ops/format.ts`, and the `reviews` and `repository-audits` lanes in `docs/catalog/lanes.json`. Future review output goes under the gitignored `reports/` tree.

## Why

A review is evidence about a commit; git holds the commit. Keeping the output in the tree is the sprawl the system exists to end.

## Done when

`docs/reviews/` is gone; `rg -n 'docs/reviews/' packages tooling tests scripts docs .claude` returns zero or names only the population file's new home; `LEGACY_ROOTS` loses the `reviews` row; `pnpm check:structure` and `pnpm check:agents` are green.

## Evidence

Filled at landing: what ran and where its output is.
