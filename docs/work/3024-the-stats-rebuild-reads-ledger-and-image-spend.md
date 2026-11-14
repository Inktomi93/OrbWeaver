---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: stats
plan: stats-and-spend
---

# The stats rebuild reads ledger and image spend in one unpaged query

## What

scanLedgerSpend and scanImageSpend in packages/server/src/domain/stats/persistence/rebuild-from-canon.ts read every row for the owner in one query and fold them without yielding, while the message, swipe and embedding scans page by CHUNK and yield between pages. Removed canon writes one ledger row per paid sample, so the ledger grows with deleted history.

## Why

The paging change exists so a rebuild never holds the event loop on a heavy library; the two unpaged scans can still hold it.

## Done when

Both scans page by CHUNK with a keyset cursor and yield between pages, and the rebuild yield case covers a library with many ledger rows.

## Evidence

Filled at landing: what ran and where its output is.
