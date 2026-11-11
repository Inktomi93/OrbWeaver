---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: character
lane: wt/agent-ad0e85a8b8ba4ff64
---

# One malformed greeting no longer erases every greeting on read

## What

`greetingsColumnSchema` in `packages/contracts/src/character/index.ts` is an array schema with a whole-array catch, the shape the versioned-config header forbids. `packages/server/src/domain/character/persistence/queries.ts` and `packages/server/src/domain/discovery/persistence/card-reads.ts` parse through it, and the refinery read unwraps the catch to work around it. Source: `reports/codebase-review/units/contracts.md`.

## Why

A card with one bad stored greeting reads back with none.

## Done when

The schema heals element by element, a test stores one malformed greeting beside valid ones and reads the valid ones back, and the refinery workaround is removed or kept with its reason.

## Evidence

Filled at landing: what ran and where its output is.
