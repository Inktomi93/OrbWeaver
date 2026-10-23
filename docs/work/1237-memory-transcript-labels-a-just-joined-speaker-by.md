---
kind: bug
status: open
updated: 2026-10-23
priority: P2
area: chat
---

# Memory transcript labels a just-joined speaker by raw character id

## What

`packages/server/src/domain/chat/memory/generate/substrate/transcript.ts` (`speakerLabel`, around line 54) falls back to `row.characterId` when the turn's macro-name map lacks the speaker. The map the memory pass receives omits a character added to the room through `addCharacterToChat` after the transcript began, so the block build after that character's first reply sends the summarizer a line such as `character_0000000000000000000000001t: ...` beside `Aria: ...`. Reproduced by `tests/server/domain/chat/engine/core-memory.int.test.ts` once it seeds Bryn's replies through real forced turns; the test's own assertion that no character id reaches a summarizer body catches it.

## Why

An internal id leaks into model input and the summary names a speaker nobody can read; a row-seeded history never ran the join path, which is why it went unseen.

## Done when

The speaker label resolves every participant present at the row's seq, including a later join, from one production source; the fallback to a raw id is removed and the type makes an unresolved speaker a refusal, not a label; core-memory's real-turn case is green.

## Evidence

Filled at landing: what ran and where its output is.
