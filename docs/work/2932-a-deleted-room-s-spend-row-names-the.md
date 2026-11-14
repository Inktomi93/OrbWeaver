---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: stats
---

# A deleted room's spend row names the canon it came from

## What

A deleted room's paid spend stays as `retired-canon` ledger rows, and a row carries only its facts (kind, cost, time, model, provider, notional), not the canon it came from. Two reproductions show spend above money paid on the live path and after a rebuild. First: delete a room with a paid turn, then import the same chat again or restore an older backup that holds it; the canon comes back with its cost and the `retired-canon` row still carries it, so the owner `costUsd`, `costSamples` and notional, the timeline `costUsd` and `costSamples` of that day and the model row `costUsd` and `costSamples` double, while counts, words, tokens and chats do not. Second: one paid turn; delete the room's only character (one `retired-canon` row); export the library; seat a new card in the room, whose admission deletes the matching `retired-canon` row (`packages/server/src/domain/stats/persistence/retire-canon.ts`); restore the earlier export. The ledger restore (`packages/server/src/domain/stats/persistence/spend-ledger-portability.ts`) adds back any row it holds fewer copies of, so it cannot tell a row a re-seat consumed from a missing one: one `retired-canon` row returns and the spend shows twice the paid cost. Which restores double: only a restore onto the same library of an export taken while a `retired-canon` row existed that the library later consumed (the re-seat above). A restore onto the library that wrote it while every exported `retired-canon` row is still held adds none, because the restore lands the nth copy of a fact only while fewer than n are held; `tests/server/domain/stats/persistence/canon-retirement.int.test.ts` covers that case, so same-library restore is safe only in that state, not in general. A restore into a second, empty library holds no rows, so every exported `retired-canon` row lands once; the room it came from is either absent from the export (deleted) or seatless and out of scope, so the rebuild folds the spend once. The fix needs a schema change: a source identity column on `spend_ledger` in a numbered migration.

## Why

Spend must equal money paid. Today a delete followed by a re-import, or a re-seat followed by a restore, shows the same paid turn twice.

## Done when

Each `retired-canon` row carries the identity of the canon it came from, and the re-seat admission, the import and the ledger restore match on it, so a row whose canon is back in scope is never folded beside that canon and a consumed row is not restored. The identity is the room's D290 content identity (`chatContentHash`) with the source message's place in the transcript, not the chat id: a re-imported room gets a new chat id, so a chat id cannot link the returned canon to its `retired-canon` row, while the content identity is what import already matches a returning room on. Both reproductions show spend equal to money paid on the live path and after a rebuild.

## Evidence

Filled at landing: what ran and where its output is.
