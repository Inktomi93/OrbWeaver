---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: character
---

# The character handle contract carries the slug alphabet

## What

`characterHandleSchema` in `packages/contracts/src/character/index.ts` checks length only, so `character.create` and `character.update` over tRPC accept any handle up to the cap, including `..`, a backslash or a NUL. The library export writes each chat under `${handle}/${chatId}` (`packages/server/src/domain/export/verbs/portable-exports.ts`) and relies on the slug alphabet it never enforces, so an owner who plants such a handle in their own account breaks every later export with chats at the zip-slip check. `findByOwnerHandle` in `packages/server/src/domain/character/persistence/queries.ts` also does not exclude the synthetic `__group__*` rows, so a chat bundle naming one can bind a restored chat to the owner's own group character. Both are owner-scoped and self-inflicted; neither crosses a tenant.

## Why

The export path depends on a property the contract does not state; a guarantee that lives in one producer (`slugifyHandle`) and not in the type is a guarantee by habit.

## Done when

The handle contract states the alphabet (a handle is a fixed point of `slugifyHandle`, or the equivalent regex in one home) and every producer and the raw tRPC inputs validate through it; the export's directory segment is derived from the handle through the same rule; `findByOwnerHandle` excludes synthetic group rows for restore lookups or the bundle lookup refuses them; red-first tests for a hostile handle over tRPC, the export with chats, and the group-row bind.

## Evidence

The alphabet has one home: `SLUG_HANDLE_PATTERN` in `packages/kit/src/slug/index.ts`, beside `slugifyHandle`. It matches runs of letters, digits and marks that start on a letter or digit, joined by single hyphens. `characterHandleSchema` (`packages/contracts/src/character/index.ts`) applies it under the length cap. The rule is the image of the fold, not its fixed points. The fold is not idempotent: a name past 64 code points folds to `…-orb-14m3nf5`, and `ℌello` folds to `Hello`. The fixed-point check that `carriedHandle` used refused both, so a chat with such a character refused on restore.

Routed through the schema:

- tRPC `character.create` and `character.update` through `createCharacterSchema` and `updateCharacterSchema`.
- The import normalizer through `createCharacterSchema`.
- `carriedHandle`, which now drops the fixed-point check.
- The create verb and the update verb's rename, which re-parse the handle so producers that brand with `castId` are checked at the one door every non-synthetic row is minted through.
- `deriveCharacterHandle`, which folds a stored source through `portableCharacterHandle` and trims a separator its cut leaves.

Existing rows need no migration. Reads project `storedCharacterHandleSchema`, which checks length only, so `__group__*` rows and rows stored outside the alphabet keep reading. Anything that writes a stored handle elsewhere goes through `portableCharacterHandle`, which returns the handle when it is inside the alphabet and its slug otherwise. Those writers are the card's `orbweaver_handle` (`primitives/serde/card`), the export directory segment (`domain/export/verbs/portable-exports.ts`) and the bundle's seat list and speakers (`domain/export/verbs/export-chat-bundle.ts`). `findByHandle` no longer returns a synthetic row.

Red on the previous source, green after (`pnpm test`, one command per run):

- `tests/server/transport/trpc/routers/character-handle-alphabet.int.test.ts`: create and rename accepted `..`, `a/b`, `a\b`, NUL, a trailing hyphen and a line break, and stored six hostile rows. Only the `__group__` create was refused, as reserved.
- `tests/server/domain/character/persistence/handle-legacy-rows.int.test.ts`: a stored `..` row with a chat made the library export throw `ZipRejectedError (zip-slip): chats/../…`. Now the export succeeds under an in-alphabet directory, the restore re-links the chat, and the row still reads and duplicates.
- `tests/server/domain/import/loader/import-bundle.int.test.ts`, "a chat re-links to a character whose handle slugifyHandle minted": the >64-point name and `ℌello` chats refused with "the file names none".
- `tests/server/domain/import/loader/import-bundle.int.test.ts`, "two different cards carrying one over-long handle": the expectation is rewritten because a 200-unit in-alphabet carried handle is now kept and the collision suffix stays inside the cap.
- "a chat bundle naming a synthetic group character's handle never binds to that row" passed on the previous source, because `carriedHandle` already refused `_`. Each layer is proven by breaking it. With the alphabet gate removed and the synthetic filter kept, it stays green. With both removed, it goes red and the chat binds to the group row. With only the filter removed, it stays green. The source was restored and checked byte-identical against the saved patch.
- `tests/contracts/character/handle-alphabet.contract.test.ts`: hostile names fold into the contract, `portableCharacterHandle` output stays inside it, and a derived cut on a separator stays inside it. The last case fails with the trim disabled.

Coupled suites: 33 files and 123 tests passed. They are import, character, assets import/export, chat import persistence, rpg portable, compose portability, the four portability HTTP routes, the tRPC routers, the chat-import, handoff and library factories, corpus, the client import-tree plan, and the import and input-admission contracts. `pnpm typecheck` passed every program after one test-only cast fix. `pnpm lint:eslint` on the changed files exits 0.
