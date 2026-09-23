---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: docs
plan: doc-migration
---

# Turn the AST audit ledger's open findings into work items, then delete docs/reviews/ast-codebase-audit

## What

Re-check each open finding in the AST audit's running finding ledger
against the current tree. Open means status `valid-finding` or `review-pending`, or a row in either
ingestion backlog. Create a `docs/work` item for each finding that still holds, and record the ones the
tree already fixed with their commit. Then delete `docs/reviews/ast-codebase-audit/` and the documents
kept only because it cited them.

## Why

The audit ledger is the last live work state inside `docs/reviews/`. One tool holds all open work, so
its findings belong in `docs/work`.

## Done when

Every open ledger row is a work item or is recorded as fixed with a commit. The audit tree is gone.
`pnpm check:structure` and `pnpm check:agents` show no new red from the deletion.

## Evidence

Filled at landing: what ran and where its output is.
