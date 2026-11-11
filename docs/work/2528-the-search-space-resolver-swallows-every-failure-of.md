---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: server
---

# The search space resolver swallows every failure of an implicit-binding lookup

## What

packages/server/src/domain/search/substrate/space.ts resolves the connection behind the active search space inside a catch that answers null for any thrown error. For an explicit connection id the resolver now answers null itself when the connection is gone, so the catch serves only the implicit-binding calls, and there it turns every other failure, a database fault or a programming error included, into the reindexing refusal.

## Why

The search domain's own header says a turn may survive a missing or rebuilding index and never an unrelated failure. A catch that answers null for everything breaks that rule on this path and hides the fault from the log.

## Done when

The catch is removed or narrowed to the one refusal it is for, by the error's class. A test on the composed root shows a missing binding still degrades to the documented refusal and an unrelated failure in the lookup surfaces with its own identity.

## Evidence

Filled at landing: what ran and where its output is.
