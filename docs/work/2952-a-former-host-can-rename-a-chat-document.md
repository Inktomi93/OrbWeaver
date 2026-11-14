---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: databank
---

# A former host can rename a chat document after a handoff and the new name reaches the room's prompt

## What

A handoff leaves the outgoing host's chat-attached documents attached. The chat scope in `packages/server/src/domain/databank/persistence/scope.ts` (`chatScopeDocuments`) reads `chat_documents` by chat id with no owner test. The outgoing host still owns the document, and `packages/server/src/domain/databank/verbs/rename.ts` lets them rename it after they leave. `packages/server/src/domain/databank/verbs/gather-retrieval.ts` (`fitAndRender`) heads each retrieved document with its name, so the new name lands in the new host's `{{databank}}` slot. The text itself has no edit verb, and `remove` only takes the document away.

## Why

An account that no longer hosts the room, and may have left it, still writes text into the new host's prompt. D332 says old-owner room property does not stay after a transfer. A seated former host also credits their global documents under D85 by design, so the open case is the chat junction after they leave.

## Done when

After a handoff no chat document owned by another account reaches the room's retrieval scope, the rack and the prompt agree, and the handoff confirm says what leaves. A server case through the composed root hands a room off, has the former host rename a left document after leaving, and shows the new host's next wire prompt without the new name, with a control where the new host's own chat document applies. The corpus capture in `tests/support/node/corpus-databank.ts` is re-read and republished if the handoff changes it. Decide first whether the copy offer covers documents.

## Evidence

Filled at landing: what ran and where its output is.
