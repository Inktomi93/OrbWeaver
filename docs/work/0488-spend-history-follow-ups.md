---
kind: work
status: doing
updated: 2026-10-05
priority: P2
area: stats
lane: codex/launch-truth
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

Also: extraction and caption spend (generate-picture.ts:248-250) never reach stats at all; reconcileStats all-owner mode enumerates only owners with characters.

Also: the TSDoc at rebuild-from-canon.ts (reconcileOwnersMissingTimeline) should name owners whose generated assets were deleted among the per-boot re-run cases; the model_stats-only arm of the heal predicate (unpriced generations) has no test of its own.
