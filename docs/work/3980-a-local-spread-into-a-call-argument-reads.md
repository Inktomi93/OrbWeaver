---
kind: bug
status: open
updated: 2026-11-23
priority: P1
area: tooling
plan: unwired-code
---

# A local spread into a call argument reads the local's members

## What

The dead-row delete trial refuted flushWritableTurn.settle.droppedReason in packages/server/src/domain/rpg/chat-ops/flush.ts, which the graph calls dead and write-only. The local settle object is spread into the argument of ctx.onFlushSettled in the same file, so its members reach the settled event, but the graph gives that spread no read of the local's members.

## Why

A dead verdict on a member the product sends through a spread is a false delete.

## Done when

A planted local whose members are spread into a call argument's object literal gives each member a read or a send under the ruling, settle.droppedReason leaves the dead list on the real tree, and a negative twin whose local is never spread stays write-only.

## Evidence

Filled at landing: what ran and where its output is.
