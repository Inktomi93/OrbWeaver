---
kind: adr
status: active
updated: 2026-11-14
---

# Handoff and fork drop the prior host's characters

## Context

Not recorded in the ledger row.

## Decision

A host-handoff (`acceptHostHandoff`) and a non-owner fork (`forkChat`) SUCCEED: they transfer the room + history but DROP the prior host's character seats (humans and agents are never dropped); the new owner adds their own cast. Cards are single-owned, and the engine loads cast + memory under the ONE new-owner `runAsUserId` — a seat whose card resolves `null` under the new owner is `leftSeq`-stamped in the SAME atomic batch as the role swap (handoff), or omitted from the copied roster (fork; the canon/history is copied WHOLE, so a dropped character's prior lines survive). An owner forking their own chat keeps the full cast unchanged. The outgoing host's synthetic group-memory bucket is naturally orphaned — expected, not migrated. There is NO `cast_not_owned` error (the fail-closed refuse is superseded; no path throws it).

A room carries only the chat-attached world books, regex scripts and documents its host owns. Only the host attaches one, and only one they own. A handoff detaches every chat book, chat script and chat document the new host does not own, in the same atomic batch as the role swap and after the D131 copy re-points. The test is the new host's ownership, so a host who left after nominating loses theirs too. An accepted offer keeps the outgoing host's books and scripts as copies under the new host; the offer copies no documents, so they always leave. A former host keeps their originals to edit or rename, and none of those changes reaches the room.

The control is on the read side, so it holds for a row any writer leaves behind. The world-info pool's chat scope, the regex resolver's chat slice and the databank chat scope read an attachment only when its owner is the room's present host. The databank chat scope feeds both the room's document panel and its retrieval, so the panel and the prompt agree. A fork copies no chat attachments.

Homes: the chat scope of `loadWorldInfoSources` in `packages/server/src/domain/chat/assembly/world-info/pool.ts` · `listHostChatScripts` in `packages/server/src/domain/regex/persistence/queries.ts`, read by `packages/server/src/domain/regex/persistence/resolve-sources.ts` · `chatScopeDocuments` in `packages/server/src/domain/databank/persistence/scope.ts` · `createDetachHandoffBooks` in `packages/server/src/domain/world-info/persistence/handoff-copy-write.ts`, `createDetachHandoffRegexScripts` in `packages/server/src/domain/regex/persistence/handoff-copy-write.ts` and `createDetachHandoffDocuments` in `packages/server/src/domain/databank/persistence/handoff-detach.ts`, placed by `createAcceptHostHandoff` in `packages/server/src/domain/chat/verbs/participants.ts` (D337). Cases: `tests/server/domain/chat/verbs/handoff-left-attachments.int.test.ts` and `tests/server/domain/chat/persistence/handoff-stale-attachment-rows.int.test.ts`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
