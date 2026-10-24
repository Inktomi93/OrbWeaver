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

Filled at landing: what ran and where its output is.
