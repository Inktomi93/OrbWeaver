---
kind: work
status: open
updated: 2026-10-03
priority: P2
area: stats
---

# Spend history follow-ups

## What

From the 0486 lane: (1) deleting a generated image cascades away its imagery_generations row but the live rollup never subtracts the spend, so a later Recompute lowers spend; decide whether image spend is history (its own ledger like compaction) or current canon (deletion subtracts live). (2) Restore starts image and compaction spend at zero (DEFERRED portability row); carry spend history in the bundle. (3) Compaction and other chat metadata writes bump chats.updatedAt, which moves the rebuild character lastActivityAt with no live delta; decide whether those count as character activity. (4) The image delta adds modelGenSamples without genTimeMs and cost without costSamples, skewing averages.

## Why

Live and rebuilt stats must agree, and spend is money users track.

## Done when

Each point ruled and fixed with a drift-gate test.

## Evidence

Filled at landing: what ran and where its output is.
