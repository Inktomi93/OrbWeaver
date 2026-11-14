---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: stats
plan: stats-and-spend
---

# The unpaged stats rebuild scans hold the event loop on a heavy library

## What

The rebuild reads the spend ledger, the generation observations and the image generations in one unpaged read each and folds every row in one synchronous stretch (packages/server/src/domain/stats/persistence/rebuild-from-canon.ts: scanLedgerSpend, scanGenerationObservations, scanImageSpend). The driver reads synchronously, so a large table holds the loop for the whole read and fold, as the message scan did before it was paged. Measure each table at a heavy size first; page and yield the ones that hold the loop near half a second.

## Why

While a scan folds, every request on the server waits.

## Done when

A measured rebuild over a library with a heavy ledger, observation and image history shows no single loop hold near half a second, and live still equals a rebuild.

## Evidence

Filled at landing: what ran and where its output is.
