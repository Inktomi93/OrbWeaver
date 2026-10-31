---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: inference
plan: restoration-register
---

# Rebuild the remaining recall pipeline cases through the composed root

## What

The 0991 case map defers these recall cases: mode off and empty pool without an embed, maxTier, the tiered bridge, the bridge-covered and mode-excluded verdicts, live-window boundary and straddle, fail-closed missing spans, shrink reclaim, recall phase events, surfaced counts, and the eval knob and floor controls (queryWindow, retrieveK, rerankTo, minScore, off-corpus query).

## Why

None has a maintained composed case, so a regression in the recall pipeline's verdicts or knobs ships unseen.

## Done when

Each case has a composed test through the server root with a defect control, and its 0991 case-map row flips to Rebuild.

## Evidence

[Recall pipeline](../../tests/server/domain/chat/memory/recall-pipeline.suite.int.test.ts) runs the composed root on a transcript the production memory build digests. The provider embedding edge is scripted, and the cosine, bridge, floor and rerank run in production. Each turn's trace is read from `recallRecorder`, the recall recorder the root composes, through `recallMemory` called by `chat.send`.

Built, each with a planted production change that failed it (the 0991 defect controls list them): mode off, empty pool without an embed, `maxTier`, the tiered bridge, the `bridge-covered` and `mode-excluded` verdicts, surfaced counts, the live window outranking relevance, and the `minScore`, `queryWindow`, `retrieveK`, `rerankTo` and off-corpus knob controls.

Built in the second leg, each with a planted production change that failed it:

- Shrink reclaim: the room's last two messages are hidden through `setMessageHidden`, `memory-backfill` runs, and the omnibox digest search no longer holds the last block. Planted change: the reclaim ceiling raised past the block count.
- The mode-switch buckets and the group character's missing omniscience: a two-character room shows a scoped speaker reading the shared bucket and its own, never the other speaker's, and a merged speaker reading only the shared bucket. Planted changes: recall drops the shared bucket; recall reads only the shared bucket.

Open:

- A tier-1 digest straddling the live-window cutoff. The cutoff is the previous turn's token fit boundary, and a test cannot place it inside a block.
- Fail-closed missing spans. A late joiner added through `addCharacterToChat` recalled its post-join digests with their spans present before any manual index sweep, so the product indexes every block it digests. A digest with no span is a storage state; it needs a persistence suite that deletes a segment row. Not built.
- Recall phase events. They are live bus events a test reads from the transport stream, as the recipient isolation suite does. Not built here.
