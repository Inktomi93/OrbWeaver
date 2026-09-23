---
kind: plan
status: active
updated: 2026-09-23
---

# Demo seeding through real sessions

## Goal

The shipped demo chats are produced through the real session and turn verbs and replayed with every plane intact, instead of committed static transcripts and a hand-written board.

## Shape

**Already built:** the orb-native chat bundle carries rpg campaign planes, injections, room overrides and tag overlays (`packages/server/src/kit/serde/chat-bundle/index.ts`, with `packages/server/src/domain/rpg/persistence/portability-write.ts`), so a real rpg session can now travel.

Today the seeder generates nothing: it replays committed JSONL transcripts and replays the rpg board from a hand-written op list (`packages/server/src/domain/chat/seeder/demo-chats.ts`). That fakes per-message persona attribution, drops the per-turn rpg snapshots and tool-call rolls, and loses input token counts.

The shape: a development record harness under `scripts/` sets up each room properly (the rpg demo with real config), drives real turns through the pipeline against the chosen hosted model, and exports each chat through the chat bundle. The seeder then imports those bundles through the real import verb.

## Open questions

- Real or synthetic demo data: `docs/work/0054-decide-whether-demo-data-is-generated-through-real.md`.
- Which hosted model and key generate the demos, and how is a regeneration kept reproducible?

## Rejected

- A demo-only capture path beside the general export contract: the chat bundle already carries the rpg planes, so a second format would fork it.
- Hand-editing the committed transcripts: owner law says demo chats are generated, never authored.

## Coupled sites

- `packages/server/src/domain/chat/seeder/` (the demo manifest and the seed path)
- `packages/server/src/kit/serde/chat-bundle/`
- `packages/server/src/domain/import/` (the bundle import verb)
- `scripts/` (the record harness)
- the `@orb/default-content` package (the shipped demo assets)

## Test plan

- A seeded demo room exports and re-imports byte-equal on every plane the bundle carries.
- The rpg demo seeds turn snapshots and tool-call rows, not only a hand snapshot.
- The seed path runs the real import verb, with no bulk-write shortcut.
