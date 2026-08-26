---
kind: design
status: complete
updated: 2026-08-26
---

# Issue 720: retry-safe creation and host handoff

## Outcome and evidence

Four already-authored workflows gain a retry boundary at the smallest durable unit that can arbitrate them:

1. `chat.generateImage` keeps the completed provider result and retries only canon allocation after a
   `messages_chat_seq_unique` collision (`packages/server/src/domain/chat/verbs/generate-image.ts:40-91`).
2. bulk chat import claims `(primaryCharacterId, importHash)` in the same batch that creates the imported
   room, replacing the advisory seat-join prefetch (`packages/server/src/domain/chat/persistence/import-write.ts:97-113,645-689`).
3. `startAsGame` folds an RPG-owned game insert plan and the bus-owned durable `chatCreated` statement into
   the existing chat/roster/greeting creation batch, with the chat-owned opaque pointer born in the same
   `chats.metadata` value
   (`packages/server/src/domain/chat/verbs/start-chat.ts:178-226`; `packages/server/src/domain/rpg/game-mint.ts:18-48`).
4. host handoff records a chat-owned completion marker in the role-swap batch, then clears it only after the
   idempotent RPG actor re-key and `chatUpdated` event tail finish. A retry by the accepted host resumes the
   marker even though the nomination is already cleared (`packages/server/src/domain/chat/verbs/roster.ts:873-989`).

The issue's handoff premise is partly stale on this checkout. RPG GM-preset healing and durable sheet re-key
already arrive as unexecuted statements and commit inside the role-swap batch
(`packages/server/src/domain/chat/verbs/roster.ts:927-947`;
`packages/server/src/domain/rpg/chat-ops/handoff-heal.ts:80-89`). This design preserves that mechanism and
does not mint a second heal. Only snapshot actor re-key, the public event, and audit completion remain outside
the current swap (`packages/server/src/domain/chat/verbs/roster.ts:873-989`).

## Chosen architecture

### Canonical image append

The provider/materialization call remains exactly once. After it returns, a small append loop reads the current
canon head, mints fresh slot/variant ids, and attempts the existing `insertCanonMessageStatements` batch. A
unique-constraint collision discards only that attempted allocation and repeats from the new head. Any other
constraint or I/O error escapes. Each collision is proof that another writer advanced the finite work queue, so
there is no arbitrary retry count and no provider re-spend. The existing engine and user-message append retry
patterns are the precedent (`engine/engine.ts:576-602`; `verbs/turn.ts:706-733`).

### Scoped import claim

Add `chat_import_claims` with `chat_id` (FK, cascade), `character_id` (FK, cascade), `import_hash`, and a unique
key on `(character_id, import_hash)`. The primary character is the scope because that is the explicit import
operation key and the exact character used by both the current dedup read and branch resolution; extra roster
members do not gain ownership of the source corpus merely by being seated.

Every fresh room batch inserts its claim after the `chats` row and before child canon. Concurrent losers get a
unique violation and re-read the exact claim. If it now exists, the loser reports the room as skipped and runs
the existing NULL-guarded persona heal; if it does not exist, the unique failure came from another invariant and
is rethrown. Same-run duplicate hashes continue to collapse in memory before a second plan is built.

The claim table, rather than a unique index on `chats.import_hash`, preserves character scope: two character
libraries may import identical bytes independently. It also avoids adding `ownerId` to `chats`, forbidden by
D18. A separate reservation transaction is rejected because it can strand an ownerless pending claim on crash
and would require leases/reaping that this operation does not need.

### Atomic start-as-game birth

Replace the write-performing `ChatRpgOps.startGame` with an RPG-owned `planGameBirth` operation returning the
minted game id plus unexecuted RPG table statements. Chat calls it before its creation batch, merges the returned
`gameId` into its own opaque `metadata.rpg` pointer, and places the RPG statements after the chat insert in the
same `db.batch`. RPG remains the only constructor of `rpg_games`; chat remains the only constructor of
`chats.metadata`. The chat bus prepares the room's first `chatCreated` append with its construction-known cursor
(`seq=1`). Its statement joins the birth batch; after commit, a paired callback publishes that already-durable
row into the bus ring/live fan without appending again. The narrow RPG callback likewise emits the live-only
`gameChanged` tick after commit. Both callbacks are synchronous/in-process and carry no second durable write,
so the durable room/game/pointer/creation-event shape is complete before anything can observe the returned
room.

Regular host-gated `rpg.createGame` keeps the existing `mintLiteGame` path. Generalizing every cross-domain
write into a transaction coordinator is rejected: one existing batch already owns this birth and `BatchStmt`
co-statements are the repository's established cross-domain atomic seam.

### Resumable host-handoff tail

Add one chat-owned `chat_handoff_resumptions` row per room: `chat_id` primary/FK, `accepted_by_user_id` FK, a
validated JSON list of source-to-copy actor re-keys, and timestamps. The role-swap batch upserts this marker and
the accepted-handoff audit row. Audit is supplied as an unexecuted statement by the existing foundation seam,
so the authority move and its forensic record cannot diverge; ordinary audit calls retain their best-effort
behavior.

After the swap, a shared completion function loads and validates the marker, calls the already idempotent
`handoffRekeyActors`, emits `chatUpdated` through the bus's checked append door, then deletes the marker. The
ordinary bus is deliberately total and resolves after classifying a dropped append; the checked door preserves
that verdict so a false durable result throws and leaves the marker rather than laundering “awaited” into
“logged.” A second `acceptHostHandoff` by the accepted host checks for its marker before requiring a still-pending
nomination and resumes the same function. Failure before delete leaves the full retry payload durable. A crash
after the durable event append but before marker delete can replay a level-triggered `chatUpdated`; consumers
already refetch on this event, so duplicate delivery is safe and preferable to silent loss. The handoff
notification remains in the existing swap co-batch.

Re-keying snapshots inside the swap is rejected: `writeHandState` must resolve the D124 hand head and may clone
forward, so it is not statement-shaped (`domain/rpg/chat-ops/handoff-heal.ts:91-137`). Redesigning actor keys or
history is explicitly out of scope.

## Schema and migration implications

- Add `chat_import_claims` and `chat_handoff_resumptions` to `packages/db/src/schema/chat.ts`; export follows the
  existing schema barrel.
- Both tables are chat-owned and cascade with their room. Every child FK receives a leading index unless the
  primary/unique key already leads it, per Tier-1 DB law.
- The handoff JSON is parsed at the server read seam; malformed payload is a loud invariant failure, never cast.
- This repository is in the pre-launch single-baseline window. Regenerate `0000_baseline` from the isolated
  worktree only; do not add `0001`. The merge report must call out that the next dev boot backs up and resets a
  stale-baseline database. No shared-main generation occurs in this lane.

## Failure model

| Boundary | Failure before commit | Concurrent/retry behavior | Post-commit failure |
| - | - | - | - |
| image append | provider assets remain GC-visible; no canon lie | only allocation retries; provider is not called again | event follows the one committed slot |
| import room | claim and every room child roll back together | unique loser re-reads winner and reports skip/heal | branch linking remains the existing idempotent later phase |
| start-as-game | room, roster, greetings, game, pointer and durable creation event all roll back | game id and first event are plans inside one batch | prepared event is fanned without a second append; live RPG tick fires only after complete birth |
| handoff | role swap, notification, existing RPG statement heals, audit and marker roll back together | accepted host resumes marker after nomination cleared | actor/event failure leaves marker; successful tail deletes it |

## Coupled-site inventory

- DB: `packages/db/src/schema/chat.ts`, generated baseline SQL/snapshot/journal, DB structure/integrity tests.
- Image: `domain/chat/verbs/generate-image.ts` and its integration suite.
- Import: `domain/chat/persistence/import-write.ts`, import contract context only if a test seam is genuinely
  needed, and `import-write.int.test.ts`; entry/import callers remain shape-compatible.
- Game birth: chat `contract/context.ts`, `start-chat.ts`, RPG `game-mint.ts`, `chat-ops/index.ts`, RPG game
  persistence, compose fixtures/stubs, start-chat/RPG composed tests.
- Handoff: chat schema/read/write helpers, `roster.ts`, chat context/compose audit statement injection, RPG
  handoff op unchanged except where marker tests need visibility, and roster/handoff integration tests.

## Red-first and verification plan

1. Concurrent image generation is held at the provider-return barrier; old code loses one append to the seq
   unique constraint, while the fix returns two views and calls the provider once per request.
2. Concurrent identical imports are held after the prefetch; old code creates two rooms, while the claim leaves
   one room/claim and reports one import plus one skip.
3. Injected RPG birth-plan and prepared-event failures each prove no chat survives; the old post-chat
   `startGame`/event failures leave a room. A real composed success asserts room, game, pointer and exactly one
   durable `chatCreated` row together, followed by one `gameChanged` live event.
4. Injected first actor-rekey failure and a subsequent total-bus false verdict each leave the marker; retry by
   the accepted host clears it, moves actor identity, does not duplicate the audit, and durably emits the
   completion event.
5. Run the focused chat image/import/start/roster and RPG handoff/game DB integration suites, the fresh-baseline
   migration/DB schema suites touched by the two new tables, then package typecheck and lint for touched files.
   No whole-tree battery, structure gate, or normal hooks run in-lane.
