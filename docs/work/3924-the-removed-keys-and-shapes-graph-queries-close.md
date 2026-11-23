---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# The removed-keys and shapes graph queries close their review leftovers

## What

A src .d.ts shim that types an untyped library makes two wrapper props types a restated pair (tooling/src/unwired/graph/build.ts keeps the file, graph/shapes.ts counts its members as ours). Casts came over at graph/removed-keys.ts and native.ts readTexts. Six clauses have no planted case: three in graph/removed-keys.ts and three in graph/shapes.ts, listed in the removed-keys and shapes review report.

## Why

A shim's members are a library's, not ours; a cast closes a case a type could close; a clause with no red case can break unseen.

## Done when

A planted shim .d.ts gives no restated pair; the casts are replaced by types; each of the six clauses has a case that goes red when it breaks.

## Evidence

Filled at landing: what ran and where its output is.
