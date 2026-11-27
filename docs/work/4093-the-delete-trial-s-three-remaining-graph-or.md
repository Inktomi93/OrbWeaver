---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: unwired-code
---

# The delete trial's three remaining graph or trial misses at the final engine

## What

The final delete trial on the fixed engine still refutes three rows outside the boarded narrowing-cascade and snap-pairing items: ThemeInsert.updatedAt (an error at packages/server/src/domain/settings/persistence/theme-queries.ts after the whole-row values fix), readMessagesByChat.byChat.createdAt (packages/server/src/domain/discovery/themes/backfill.ts) and budgetInjections.dropped.id (read error at packages/server/src/transport/trpc/routers/chat.ts).

## Why

Each is a member the graph calls unread that the delete trial shows is read, or a trial misreading a delete; either way a cleanup would act on a false finding.

## Done when

Each row is judged as a graph miss or a trial misread and fixed red-first, or proven a real finding with its reader named; a trial run lists none of them as refuted.

## Evidence

Filled at landing: what ran and where its output is.
