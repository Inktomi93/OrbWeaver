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

Built in the third leg, each with a planted production change that failed it:

- The live-window straddle. The cutoff is the previous turn's token fit boundary, so [the recall pipeline case](../../tests/server/domain/chat/memory/recall-pipeline.suite.int.test.ts) walks the turn's context window down until the stored boundary on the newest reply falls inside a tier-0 block, then reads the verdicts: the tier-1 digest holding the cutoff is `live-window` and the tier-0 block holding it stays `admitted`. Planted changes: the overlap test reads the span start at every tier; the overlap test reads the span end at every tier.
- Fail-closed missing spans. [Scoped digest horizon](../../tests/server/domain/chat/memory/persistence/scoped-digest-horizon.int.test.ts) builds the late-joiner room, reads a recall of the late character with its spans present (the digests reach the live-window stage), deletes one block's `chat_segments` rows and reads the next recall: that block is `unwitnessed`, its neighbour is unchanged. Planted change: a missing span passes the pool filter.
- Recall phase events. The recall pipeline case opens the owner's `stream.connect` stream through the composed HTTP app, attaches the room live, runs a turn with memory off and one with memory on, and reads the `memoryRecall` frames: one `recalling` with a null count, then one `recalled` whose count equals the trace's surfaced count. The memory-off turn sends neither. Planted changes: the `recalling` event dropped; `recalling` sent before the mode-off return; the `recalled` count taken from the candidate count.
