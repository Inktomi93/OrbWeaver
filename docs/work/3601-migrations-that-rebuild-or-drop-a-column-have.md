---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: db
plan: test-foundation
---

# Migrations that rebuild or drop a column have a repo test that applies them to stored rows

## What

Migrations 0021 (rebuilds user_connections to widen the api CHECK) and 0022 (drops user_seed_ledger.seeded_at) have no repo test. A review applied both to a copy of the corpus database by hand and found the rows, indexes and foreign keys intact; nothing in the suite would catch a later migration of this shape losing a column or an index.

## Why

A table-rebuild migration is the one place a row can vanish with every typecheck green.

## Done when

A case applies 0021 and 0022 to a database at the prior migration holding rows, and asserts every row survives with identical content, the three indexes and both foreign keys exist, the widened CHECK accepts the new member and refuses an unknown one, and the dropped column is gone.

## Evidence

Filled at landing: what ran and where its output is.
