---
kind: adr
status: active
updated: 2026-09-25
supersedes: docs/adr/0261-seed-content-not-conversations.md
---

# Every account is seeded with content, and names its own persona

## Context

ADR 0261 ruled that the seed is content, never a conversation, and listed a default persona among the seeded items. That contradicted the standing owner ruling that a new account creates its persona in a first-run step rather than receiving one, which the persona seeder follows: it creates a persona only on automation-started stacks.

## Decision

The seed is content, never a conversation. Every account, however it was created, receives the same seed: the shipped characters (card, avatar, greetings, lore) and roster presets that start a chat in one action. No persona is seeded for a person: a new account names its own persona in the first-run step, and only automation-started stacks (the dev and e2e seeds) receive one. No room or transcript is seeded. One manifest in @orb/default-content lists every seeded item and its kind. A per-account seed ledger records each item once it is seeded, so content the user deleted is never seeded again and a new build's added content reaches existing accounts on the next boot. An operator setting turns seeding off. Rooms already seeded on an account are the user's and are never deleted by the seeder.

## Consequences

A first-time user's first chat is generated live from a seeded greeting, which makes greeting quality a release surface. The dev seed may keep generated chats as a development fixture; the user seed never reads them. The seed ledger records a persona key only where an automation-started stack created one.

## Alternatives rejected

Seed a default persona for every account, as 0261 said: it skips the first-run step the owner ruled a person takes.
