---
kind: decision
status: open
updated: 2026-09-23
priority: P3
area: server
---

# Decide where the reasoning-duration statistic comes from, then retire the deferred open-JSON parity warning

## What

The owner ruled that no repair is needed. The reasoning-duration statistic already has a live writer, a typed shape and both readers:

- The live turn stamps it. `runTurnPipeline` in `packages/server/src/domain/chat/engine/pipeline.ts` measures the reasoning window on the injected clock, and `liveVariantMetadata` in `packages/server/src/domain/chat/engine/engine.ts` writes it under `VARIANT_METADATA_REASONING_MS_KEY`.
- `VariantMetadata` in `packages/contracts/src/chat/messages.ts` types the key, so the column is not an open bag.
- The stats rebuild in `packages/server/src/domain/stats/write/rebuild-from-canon.ts` and the live stats delta in `packages/server/src/domain/chat/substrate/stats-delta.ts` both read it.

The warning policy `open-json-column-key-parity-deferred` reported nothing on this tree, so it and its deferred authority list are deleted.

## Why

A warning policy with no finding and no open repair reads as tracked debt that does not exist.

## Done when

The policy `open-json-column-key-parity-deferred` and its deferred authority list no longer exist, and `open-json-column-key-parity` judges every subject.

## Evidence

Filled at landing: what ran and where its output is.
