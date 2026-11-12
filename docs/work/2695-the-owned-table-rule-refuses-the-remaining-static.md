---
kind: tooling
status: doing
updated: 2026-11-12
priority: P3
lane: wt/agent-a672cae2c753c5fe3
plan: checked-law
---

# The owned-table rule refuses the remaining static spellings of a table read

## What

`tooling/src/eslint/owned-table.ts` refuses the common ways to reach an owned table without importing it. The recheck in the tooling review under reports/code-reviewer lists spellings that still pass and are within static reach: a computed key held in a constant, a helper that returns the relational query object or a spread copy of it, a nested destructure from the database handle, the full schema handle, a comma join in raw SQL, `sql.raw` given a constant string, `sql.identifier`, and an aliased `sql` import. A reflective read, a table name split across template parts and a direct client call with a plain string are out of static reach.

## Why

Each open spelling is a way around a single-owner rule that an author would have to choose on purpose, and the rule should say no to the ones it can see.

## Done when

Each listed static spelling has a planted control that the rule refuses, the tree stays at zero, and the rule's header names the spellings that remain out of reach so review knows to look for them.

## Evidence

Filled at landing: what ran and where its output is.
