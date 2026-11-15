---
kind: tooling
status: open
updated: 2026-11-15
priority: P2
area: tooling
plan: typed-enforcers
---

# The blind catch lint rule never judges a named rejection handler

## What

`isRejectionHandler` in `tooling/src/eslint/async.ts` judges only an inline function, so `.catch(swallow)`, `.then(ok, swallow)` and `.catch(Boolean)` pass while the law says such a handler reads its error. The live case is the swallow sites in `png-card-chunk/index.ts`.

## Why

The old blind catch passes the rule under a name, and the law line claims more than is enforced.

## Done when

A same-file named handler that answers a constant or nothing without reading its error is refused. The rule test has rows for the identifier, the `.then` second argument and the builtin shapes. The `png-card-chunk` swallow sites are judged: kept by a cited ruling or narrowed.

## Evidence

Filled at landing: what ran and where its output is.
