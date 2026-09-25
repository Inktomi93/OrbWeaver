---
kind: adr
status: active
updated: 2026-09-25
---

# Every account is seeded with content, never with conversations

## Context

Every new account was seeded with six example rooms holding pre-generated transcripts (packages/server/src/domain/chat/seeder/, packages/default-content/demo-chats/). The transcripts went stale with each change to prompt assembly and needed regenerating, and a friend who joined the host's copy of an example room saw two rooms with one title on Home. SillyTavern seeds a character card with its greeting, a lorebook, sprites and a default persona avatar, copied once per user through a manifest and a per-user ledger, and seeds no chats.

## Decision

The seed is content, never a conversation. Every account, however it was created, receives the same seed: the shipped characters (card, avatar, greeting and alternate greetings, lore), the default persona, and roster presets that start a group chat or an RPG campaign in one action. No room or transcript is seeded. One manifest in @orb/default-content lists every seeded item and its kind. A per-account seed ledger records each item once it is seeded, so content the user deleted is never seeded again and a new build's added content reaches existing accounts on the next boot. An operator setting turns seeding off. Rooms already seeded on an account are the user's and are never deleted by the seeder.

## Consequences

The shipped example transcripts leave the user seed, so no transcript needs regenerating and no seeded room is embedded at first boot. A first-time user's first chat is generated live by the current engine from a seeded greeting, which makes greeting quality a release surface. The dev seed (pnpm seed:demo) may keep generated chats as a development fixture; the user seed never reads them.

## Alternatives rejected

Keep seeded rooms and mark the joined one with its host: fixes the duplicate title but keeps the stale transcripts. Skip the seed for invite-created accounts: the owner ruled every account gets the same seed. Keep one showcase room: still a transcript that goes stale.
