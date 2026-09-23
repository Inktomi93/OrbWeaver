---
kind: adr
status: active
updated: 2026-09-23
---

# Token usage carries provenance at variant grain

## Context

Imported chats and some providers carry no usage numbers, and the stats surfaces rendered absence as zero, including a fabricated zero cost. An estimate shown as an exact count launders provenance.

## Decision

`message_variants.token_provenance` is `measured | estimated | unrecorded`, defaulting to `unrecorded`; the tuple and `combineTokenProvenance` live in `@orb/contracts/chat`. A live turn with usage stamps `measured`; an import uses an exact source count as `measured`, else `@orb/kit/tokens` `estimateTokens` as `estimated`, and never synthesizes cost. Rollups store per-axis sample counters (measured, estimated, cost), so signed swipe and delete deltas stay reversible; an axis reads `estimated` if any estimate remains, `measured` if any measured sample remains, else `unrecorded` and null. Cost returns only when cost samples exist. The UI renders `~N tok` for estimates and nothing for unrecorded. The ST writer emits `token_count` only for measured rows. Catch-up for existing canon is an import-owned workload that writes through a chat-owned compare-and-set step.

## Consequences

A local model's real zero stays a measured zero. A mixed sum is labeled approximate. Chat stays the only writer of `message_variants`; import interprets and asks.

## Alternatives rejected

- One aggregate provenance flag: a signed delta cannot know whether it removed the last estimate.
- Infer recordedness from a positive total: measured zero is real, and token presence says nothing about cost.
- Scale estimates by the tokenizer headroom factor: that factor is a capacity safety margin, not a calibration.
- Backfill SQL inside import: `message_variants` is chat-owned canon.
- Fold catch-up into the ST import: existing canon must be repairable without re-reading an ST profile.
- A synthetic provider stream chunk to test cost settlement: it starts after the cost field was already translated, which is the step under test.
