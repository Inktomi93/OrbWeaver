---
kind: work
status: open
updated: 2026-10-12
priority: P1
plan: test-foundation
---

# One home for drizzle query facts

## What

Tables, joins, subqueries, columns, reads and writes are read once, in `tooling/src/floor/code-facts/`. Move `resolveTableDef` and the checker read path from `tooling/src/ast/lib/columns.ts` and `column-reads.ts`, and fold `verify/lib/drizzle-client-call.ts`, `tenancy-read.ts`, `tenancy-join.ts` and the json-column readers onto it. `pnpm ast columns`, the tenancy gates, the json-column gates and the single-writer gates call it. byte-check-cast reads its schema population through the one drizzle fact.

## Why

Gates and `pnpm ast` read drizzle code two ways, so a `pnpm ast` verb finds what a gate misses and every gate fix re-learns the same shapes.

## Done when

One drizzle reader in the floor; the old readers are deleted; `pnpm ast columns` output and every caller gate's findings are unchanged or a recorded improvement.

## Evidence

Filled at landing: what ran and where its output is.
