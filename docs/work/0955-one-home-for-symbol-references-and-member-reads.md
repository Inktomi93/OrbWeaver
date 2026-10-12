---
kind: work
status: open
updated: 2026-10-12
priority: P2
plan: test-foundation
---

# One home for symbol references and member reads

## What

`ast/lib/resolve.ts`, `usage.ts` and `ast/ops/wiring.ts` answer reference and member-read questions beside `floor/code-facts/reference-fact.ts`. Move `pnpm ast refs`, `callers`, `importers` and `unwired` onto the floor reader and delete the ast copies. Item 944 started this for member reads.

## Why

Two reference stacks mean a `pnpm ast` verb and a gate can disagree about who calls what.

## Done when

`pnpm ast` reference verbs run on the floor reader; output diffed unchanged; the ast copies are deleted.

## Evidence

Filled at landing: what ran and where its output is.
