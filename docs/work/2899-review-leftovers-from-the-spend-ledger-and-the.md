---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# Review leftovers from the spend ledger and the security fixes

## What

Small findings from two reviews. The bundle case of `tests/server/domain/stats/persistence/picture-spend-history.int.test.ts`, the streamed case of `tests/server/entry/http/body-limit-population.int.test.ts` and `tests/server/transport/trpc/message-history-cursor.int.test.ts` run close to their time budget and time out on a busy box. `tests/client/features/discovery/components/corpus-readiness-rail.ct.tsx` asserts the confirm sentence's lead words as literals. The testkit type `CompactionSpendRow` in `tests/support/node/factories/chat.ts` now names every ledger row. The comment on `cost_usd` in `packages/db/src/schema/imagery.ts` still says the column sums extraction and caption cost, which the ledger now holds. `drizzle-kit` bundles a version of zod with an open advisory, which keeps `pnpm audit` red for a tool that never ships.

## Why

Each one misleads the next reader or turns a busy run red for no defect.

## Done when

The slow cases carry the slow tag with a measured budget, the confirm lead is asserted through production, the type and the comment say what they hold, and the drizzle-kit advisory is fixed by an upgrade or recorded as a triage.

## Evidence

Filled at landing: what ran and where its output is.
