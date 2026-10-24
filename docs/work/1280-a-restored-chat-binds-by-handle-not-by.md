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

Filled at landing: what ran and where its output is.
