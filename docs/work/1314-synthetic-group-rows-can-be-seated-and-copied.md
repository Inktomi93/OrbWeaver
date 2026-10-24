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

Filled at landing: what ran and where its output is.
