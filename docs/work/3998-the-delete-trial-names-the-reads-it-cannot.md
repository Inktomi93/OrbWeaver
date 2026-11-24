---
kind: tooling
status: open
updated: 2026-11-24
priority: P2
area: tooling
plan: unwired-code
---

# The delete trial names the reads it cannot see

## What

The delete trial confirms a member when deleting it compiles, but some live reads compile without the member: flushWritableTurn.settle.droppedReason (flush.ts) is spread into an argument whose type keeps the key optional, and WireRow\.costRow\.extraTokens reaches an inline parameter that declares it again. Both come back named-only although the product reads them.

## Why

A named-only or confirmed verdict reads as proof a member is dead, and these shapes make the trial undercount the graph's false deletes.

## Done when

The trial report lists, per candidate, the shapes it cannot test (an optional slot fed by a spread, a parameter type that redeclares the member), a planted case of each is flagged instead of named-only, and the dead-row trial's summary states the undercount.

## Evidence

Filled at landing: what ran and where its output is.
