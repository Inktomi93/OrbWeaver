---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: character
---

# Synthetic group rows can be seated and copied by a handoff

## What

`addCharacterToChat` (`packages/server/src/domain/chat/verbs/participants.ts:725`) and the bulk-import ownership check `assertOwnedCharacters` (`chat/persistence/import-write.ts:68-74`) accept a `synthetic` group row id, which narrator messages expose. `getCard` and `listOwnedCharacterRows` (`character/persistence/queries.ts:622-630`) carry no `synthetic` filter, so a handoff with `copyCharacters` copies the group row into the nominee's library as a visible "Group" card. The gallery, databank and imagery exporters skip synthetic rows, but no test asserts it: removing the filter from `gallery-character.ts` or the `portability-read.ts` join leaves the suite green.

## Why

A synthetic row is internal room machinery; seating or copying it leaks a meaningless card and, before item 1293's handle fold, could squat the nominee's group handle and break group turns in that room.

## Done when

Both seat paths refuse synthetic ids and `listOwnedCharacterRows` excludes them, with red-first integration cases; an export case for an owner whose group row has a gallery item, an imagery generation and a databank attachment fails when any one of the three exporter filters is removed.

## Evidence

- Survey: `ast-grep` for `$D.insert(chatParticipants)` over `packages/server/src` (1812 TS files) found 5 seat writers. Three take a caller-named character id: `startChat`, `addCharacterToChat` and the bulk import. `fork` and the handoff copy only carry existing seats. `startChat` was a third open path: its founding check reads `getCard`, which returns a synthetic row's card.
- Gate: `assertSeatableCharacters` (`packages/server/src/domain/chat/persistence/seat-characters.ts`) is the bulk import's former owned-character check with `synthetic = false` added. `startChat`'s founding check, `addCharacterToChat` and the bulk import all run it. A synthetic id gets the same leak-free `DomainNotFoundError` a stranger's id gets. `getCard` is unchanged, because narrator and roster reads resolve the group card through it.
- Copy: `listOwnedCharacterRows` excludes synthetic rows, so the handoff copy drops a seated group row to the existing missing-source path. Its other consumer, `createOwnedCharacterIds` (saved-roster member verification), now drops a synthetic id too.
- Red first, in `tests/server/domain/character/persistence/handle-copies-and-restores.int.test.ts`:
  - "can neither found a room nor join one" got `{ founded: "accepted", joined: "accepted", groupSeated: true }` on the old source.
  - "a handoff copies a room's cards but never its seated synthetic group row" copied the group card into the nominee's library on the old source. Its group seat is written directly, as a room seated before the gate.
  - Both pass now.
- Bulk import: no request path hands `bulkImportChats` a synthetic id. Every import resolution goes through `findByHandle`, `findByName` or `findByImportHash`, which exclude synthetic rows or cannot match one. So its integration case is the existing `import-bundle.int.test.ts` group-squat case, layered in a scratch run. With the alphabet in `carriedHandle` and the `findByHandle` synthetic check both removed, the case stayed green, because the new gate refused. With the gate's filter also removed, the chat bound to the group row (`{ ok: true, groupRooms: [["hello"]] }`). Every probe edit was restored, and `git diff` shows the probed files unchanged.
- Exporters: "an owner's export names no synthetic group row as a gallery, databank or imagery subject" holds a group-subject portrait, gallery item, imagery generation and databank attachment. It checks that each source holds the group row. In three scratch runs, removing one filter at a time failed exactly that field: `gallery-character.ts` (`gallery: ["group-chat-…"]`), the databank `attachedHandles` join (`databank: ["group-chat-…"]`) and the `portability-read.ts` join (`imagery: ["group-chat-…"]`). Each filter was restored.
- Runs: `pnpm test` on the suite above and `import-bundle` (both named suites pass). The coupled run covered `game-template-boundaries`, `handoff-settlement.suite`, `role-authority`, `member-visibility`, the chat-handoff and chat-import factories, `score-sweep-rows.suite`, `row-clocks`, `card-embed-ledgers`, `import-persona-heal`, `import-overlay-remap`, `imported-opening-row`, `handoff-json-boundaries` and `gallery-character-ops` (named coupled suites pass). `pnpm typecheck packages/server/tsconfig.json tsconfig.json` exits 0. `pnpm depcruise` finds no violations. `pnpm knip:prod` exits 0. Scoped `pnpm lint:eslint` and Biome exit 0.
