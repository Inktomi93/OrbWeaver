---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: discovery
plan: unwired-code
---

# Run the discovery maintenance verbs as workloads

## What

DiscoveryService.backfillDigestStoryTime and the digest, segment and image hub-score verbs have no caller, while search reads those hub_score columns and only the character pass computes one. Wire them as discovery workloads so every scored kind is scored and the story-time backfill runs.

## Why

Owner ruling: wire the discovery maintenance instead of deleting it.

## Done when

Each verb runs from a workload; search ranks digests, segments and images on computed scores; integration tests prove each score is written and read.

## Evidence

The existing `csls` workload (no new kind, no migration) now runs the character, digest, segment and image hub passes and the digest story-time backfill (`packages/server/src/domain/discovery/workload-contributions.ts`). Its result sums the rows scored across the four kinds.

- `tests/server/domain/discovery/persistence/hub-score-workload.int.test.ts` fails before the change (digest and segment `hub_score` stay null after a `csls` run) and passes after.
- `tests/support/node/corpus-knowledge-hub-scores.int.test.ts` does the same for `image_embeddings.hub_score`.
- Search already reads `hub_score` on digest, segment and image rows (`packages/server/src/domain/search/persistence/digest-rows.ts`, `image-nearest.ts`); no read-side change was needed.

The hub math is cooperative: `computeGroupHubs` (`packages/server/src/domain/discovery/substrate/hub-math.ts`) yields to the event loop every `HUB_YIELD_WORK_BUDGET` units of work and throws the run's abort reason at each yield. `csls` checks the signal between passes and reports each pass.

- `tests/server/domain/discovery/substrate/hub-math.test.ts` counts event-loop turns during a 2,000-vector group on both strategies, checks both give equal scores, and checks a cancel stops the pass at the next yield.
- `tests/server/domain/discovery/persistence/hub-score-workload.int.test.ts` fails when the backfill call, the digest pass or the first between-pass abort check is removed (mutation runs). It also asserts search digest scores move once the hub scores exist.
