---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: stored-data-integrity
---

# A memory block's span reads the union of every embed space's segments

## What

`loadSegmentSpans` in `packages/server/src/domain/chat/memory/persistence/queries.ts` folds `min(seq_start)` and `max(seq_end)` per `block_idx` over every `chat_segments` row of the chat. That table is keyed per embed generation (`chat_segments_chat_block_chunk_unique` in `packages/db/src/schema/embeddings.ts`), so when two generations hold the room on different grids, each block resolves to the union of its old and new spans. Reproduction: a host strikes a scene, hands the room off, the new host's sweep indexes the room into their own embed space while the old host's rows stay, and the admin then changes the memory block size. Both generations' rows must be present. Seen in `tests/server/domain/chat/memory/memory-strikes-reblock.int.test.ts`: at block size 1 the duel block resolved to seqs reaching the struck storm scene, so recall left the duel and shrine scenes out as retelling the strike, and the duel summary carried the strike in the view. Readers of the widened span: the strike match and the view through `resolveDigestSpans` (`packages/server/src/domain/chat/memory/persistence/strikes.ts:94`); a new strike's stored endpoints (`packages/server/src/domain/chat/memory/strikes.ts`, `writeMemoryStrike`), which then name turns the host never saw; the member view's floor (`packages/server/src/domain/chat/memory/strikes.ts`, `visible` in `buildMemoryView`); the live-window test and the witnessing test in `packages/server/src/domain/chat/memory/recall/recall.ts:257-283`. Fix: scope the span read to the host's embed space, as `loadSegmentHashes` already scopes by `generationId`, and decide what a room with no resolved space reads.

## Why

A wider span never lets a human member read more: the member view lists an item only when its span starts at or above their floor, so a lower start hides more, and recall applies no member floor through these spans. What it does is drop unstruck scenes from a new host's prompts, put a struck entry on the wrong summary, and let a character recall a scene it never witnessed: the witnessing check is per character (`loadWitnessHorizons` in `packages/server/src/domain/chat/memory/generate/turn.ts:62`), and `spanWitnessed` (`packages/server/src/domain/chat/memory/generate/substrate/witnessing.ts:15`) passes any span that overlaps a presence interval, so a block widened into the character's presence is admitted to its recall.

## Done when

A composed-root case hands a room off to a host with their own embed space, changes the block size, rebuilds, and reads each block's span as its own generation's grid: the unstruck scenes beside a strike reach the prompt, the strike's own summary carries it in the view, and a character seated after a scene does not recall it. Red before the fix.

## Evidence

Filled at landing: what ran and where its output is.
