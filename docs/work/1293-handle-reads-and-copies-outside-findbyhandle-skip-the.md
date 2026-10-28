---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: character
---

# Handle reads and copies outside findByHandle skip the alphabet and the synthetic filter

## What

After item 1278, three paths still bypass its controls. The handoff copy writes a stored legacy handle verbatim into the receiving account (`freeHandle` in packages/server/src/domain/character/persistence/handoff-copy-write.ts:45-48, written by insertCharacterClaimingProvenance, skipping the create verb's parse). The gallery, databank and imagery exporters write the raw stored handle (assets/verbs/export-gallery.ts:33 via character/persistence/gallery-character.ts:11, databank/persistence/portability-write.ts:48-53, imagery/persistence/portability-read.ts:47), so a legacy row's links drop on restore. The databank and imagery restores look up raw handles that include synthetic group rows (databank/persistence/portability-write.ts:103-120, imagery/persistence/portability-write.ts:118 and :154), so a crafted file can attach to a room's hidden group row inside the owner's account.

## Why

The handle alphabet and the synthetic-row exclusion hold only where findByHandle and the create verb run; every other read and copy is a guarantee by habit.

## Done when

The handoff copy derives the handle through portableCharacterHandle; the three exporters write portableCharacterHandle; the databank and imagery restore lookups exclude synthetic rows (or filter handles through carriedHandle); the alphabet and `slugifyHandle` exclude the invisible code points D257 refuses, with a contract test that enumerates them; red-first tests for a legacy-handle handoff, a legacy-handle gallery/databank/imagery round trip, and a crafted **group** handle in a databank and an imagery restore.

## Owner ruling

Character handles follow the D257 invisible-character rule. `slugifyHandle` drops invisible code points and `SLUG_HANDLE_PATTERN` refuses them; a name made only of invisibles takes the existing empty-slug path. Legacy reads stay length-only. A White_Space code point (NBSP, ideographic space) still folds to a hyphen, because it shows as a word gap.

## Evidence

- Survey: `ast-grep` for `characters.handle` over `packages/server/src`, `packages/contracts/src` and `packages/client/src` scanned 2779 TS files (14 matches) and 816 TSX files (0 matches). Character row writers (`insertCharacter`, `insertCharacterClaimingProvenance`, `db.insert(characters)`) scanned 1812 server files. Outside this item's sites, the export bundle seat list and the export directory already use `portableCharacterHandle`, and `duplicate` derives through `deriveCharacterHandle`. `list-host-chats.ts` feeds only the directory segment, which `portable-exports.ts` folds. The search predicate, `findByOwnerHandle`, `listOwnerHandles` and the debug inspectors read without copying.
- Alphabet: `INVISIBLE` in `packages/kit/src/slug/index.ts` is D257's default-ignorable, control and format classes plus U+2800 and U+1D159, minus `White_Space`. The fold drops it after NFKD, because U+3164 decomposes to U+1160. `SLUG_HANDLE_PATTERN` subtracts it from its letter, digit and mark classes. A `White_Space` code point still folds to a hyphen. A name made only of invisibles reaches the fallback-plus-tag path. `storedCharacterHandleSchema` is unchanged, so legacy reads stay length-only. D257 records the character-handle rule.
- Copies and exports: the handoff copy folds the stored handle through `portableCharacterHandle` before `freeHandle` probes the recipient's library. The gallery subject read (`gallery-character.ts`), the databank attachment handles and the imagery subject projection write `portableCharacterHandle`. Each also skips synthetic rows. Without that skip, the slug of `__group__<chatId>` is an in-alphabet handle that a restore could bind to a real card.
- Restores: the databank `resolveCharacters` lookup and both imagery subject lookups (`subjectIsLinked` and the output statement's subject subquery) exclude `synthetic` rows in SQL. Legacy in-account handles still match by length.
- Red first, `tests/contracts/character/handle-alphabet.contract.test.ts`: the enumeration agrees with `admitsHandle` (zero admitted). On the old kit, the alphabet admitted 267 of the code points, including U+034F, U+115F, U+1160, U+17B4, U+180B, U+3164, U+FE00 to U+FE0F, U+FFA0 and U+E0100 to U+E01EF. Controls and format characters folded to `ab-cd` instead of `abcd`. A Hangul-filler-only name kept the filler. All 5 cases pass after the change.
- Red first, `tests/server/domain/character/persistence/handle-copies-and-restores.int.test.ts`, with the kit change in and the server unchanged: the handoff copy kept `..` (`inAlphabet: false`). The round trip restored the card, but gallery, databank and imagery each lost the link (`[false]`, `[0]`, `[false]`). The crafted group handle attached the document to the group row, and the imported imagery row's subject was the group row. All 3 pass after the fix. The round trip and the real-subject imagery link are the positive controls for the synthetic filter.
- Runs: `pnpm test` on the two suites above plus `handle-legacy-rows`, `gallery-character-ops`, character and preset `handoff-json-boundaries`, `row-clocks`, `import-bundle`, `character-handle-alphabet`, `import-tree-plan`, and the chat-handoff and imagery factories (named coupled suites pass). A second run covered `portability-import.suite`, `library-producers`, `export-assets`, `portability-routes` and `chat-import` (named portability suites pass). `pnpm typecheck` on the kit, contracts, server, client and root programs exits 0. Scoped `pnpm lint:eslint` and Biome exit 0. `pnpm depcruise` and `pnpm knip:prod` ran before the commit.
