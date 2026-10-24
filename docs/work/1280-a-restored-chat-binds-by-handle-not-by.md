---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: import
---

# A restored chat binds by handle, not by the card it was exported beside

## What

After item 1259 a restored card keeps the handle its export carried, and the chat re-links by that handle. Two cases still bind wrong, found by reading, not reproduced: the target already has a different character holding that handle, so the restored card gets a `-2` suffix and the chat binds to the existing character; or the card dedupes by content onto an existing character with a different handle (a seeded character the user only renamed), so the chat refuses.

## Why

A chat exported beside a card belongs to that card, whatever handle the target had to give it.

## Done when

A restored seat resolves to the character its exported card restored as, on a handle collision and on a dedup hit; the match rule stays in the one home `packages/server/src/domain/import/substrate/handle.ts` or its successor; both cases are composed round trips, red-first.

## Evidence

This follows the hash-identity ruling recorded on item 1279: no cross-file channel. A chat bundle now carries `seatCards`, one entry per seat whose card the exporter owns. Each entry holds that card's import identity: `importHash`, `textHash` and `fileHash`. `export-chat-bundle.ts` renders the seat's card with the production card export and hashes it with `cardPngIdentity`, the character restore's own parse and hashes, injected through `ExportContext`. The renders are memoised once per library export pass. The bytes the bundle ships are not reachable at that point, because the card and chat exports are separate descriptor passes.

The match rule stays in `packages/server/src/domain/import/substrate/handle.ts` as `resolveSeat`. It tries the card identity first, through `findImportedCharacter`, the same lookup the card restore dedups by. Only then does it try the carried handle. A seat with no identity binds by handle as before: an older bundle, a co-member's card, or a card this account never restored. The identity lookup is owner-scoped.

Red on the previous source, green after (`tests/server/domain/import/loader/import-bundle.int.test.ts`, composed export and restore through `/api/export/library` and `/api/import/bundle`):

- Handle collision: the restored card landed as the suffixed row, but the chat bound to the target's existing `lantern-warden`. Now the chat binds to the suffixed row.
- Dedup hit: the card deduped onto the target's `warden`, but the chat seated `gatekeeper` failed (`failed: 1`). Now the chat binds to `warden`.
- Older bundle: a real export rebuilt without `seatCards` still re-links by handle. This case was red before only because the new export did not carry the field.
- Cross-account: a member importing the owner's bundle does not resolve the owner's card by identity. The proof was to remove the owner filter from `findByOwnerImportHash` in a scratch run. The member's refusal then named the owner's character id (red), because only the chat write's ownership check stopped it. The source was restored and checked byte-identical against the saved patch. The positive control is the owner binding the same bundle by identity alone, after renaming its copy's handle.
