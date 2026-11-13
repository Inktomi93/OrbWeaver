---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: refinery
plan: cross-surface-consistency
---

# The refinery schema editor refuses an invalid schema before save

## What

The schema editor marks an invalid name and a schema with no overall score as valid. Save then fails in `packages/server/src/domain/refinery/verbs/create-schema.ts` and the user reads the generic unexpected-error sentence.

## Why

The user is told the input is fine and then gets an error they cannot act on.

## Done when

The editor and the server validate with the same contracts schema; an invalid name or a missing overall score is named at its field before save; the server answers a typed refusal, never an unexpected error; tests cover both.

## Evidence

Filled at landing: what ran and where its output is.
