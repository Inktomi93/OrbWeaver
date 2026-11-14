---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: import
plan: import-robustness
---

# The chat and card import dialogs name a held file by its room title or card name

## What

The chat import result (chatImportResultSchema in packages/contracts/src/import/chat-result.ts) holds only filename and created per imported file, and the card result (importedCardSchema in packages/contracts/src/import/card-result.ts) holds filename, characterId, created, importHash and notes, so chatInLibraryNotice and cardInLibraryNotice in packages/client/src/lib/in-library-copy.ts name the file, not the room or card. Carrying the name is a new wire field on both shapes. Chat needs a title through the descriptor outcome too: PortableImportOutcome (packages/contracts/src/portability/index.ts, shared by every portable entity), ImportChatFileOutcome and the chat descriptor in packages/server/src/domain/import/verbs/import-chat-file.ts and import-chat-bundle.ts, then packages/server/src/entry/http/import-chat.ts. Card needs the name from ImportCharacterResult through packages/server/src/domain/import/loader/import-card-batch.ts and packages/server/src/entry/http/upload.ts. Readers of the shapes: packages/client/src/data/import-chats.ts, packages/client/src/data/import-characters.ts, chat-import-dialog.tsx, character-import-dialog.tsx, portability-model.ts summarizeCardImport, and tests tests/server/entry/compose/lifecycle-portability.int.test.ts, tests/server/entry/http/import-card-failures.int.test.ts, import-card-nul.int.test.ts, import-identity.int.test.ts, tests/server/domain/import/persistence/same-library-restore.int.test.ts, tests/client/features/character/components/character-import-refusal.ct.tsx, tests/client/features/workloads/lib/import-notes.dom.test.ts and tests/e2e/card-import.spec.ts. Owner call needed: the card could instead be named from its characterId through the cached character list with no wire change, but a room has no such read.

## Why

A person who drops several files cannot tell which room or card was already in the library when the notice names a file name they did not choose.

## Done when

A held chat or card in a batch is named by its room title or card name in the notice, the name rides the result schema with every reader above updated in the same commit, and a CT per dialog asserts the named notice for a held file through the real import route.

## Evidence

Filled at landing: what ran and where its output is.
