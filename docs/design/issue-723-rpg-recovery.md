---
kind: design
status: complete
updated: 2026-08-26
---

# Issue 723: RPG interruption recovery and stream deletion authority

## Outcome and premise audit

Five existing workflows converge after interruption without a new transaction framework or schema:

1. a turn flush commits its snapshot replacement/insert and every staged journal row in one `db.batch`;
2. a deduplicated bundle import returns the already-written chat identity, then safely replays tag and RPG
   overlays;
3. an explicit `engaged` patch always replays the chat pointer mirror, including a retry after the game config
   already landed;
4. actor promotion uses a deterministic character-provenance recovery key, so retries reuse and seat the same
   card before re-keying the actor;
5. a chat stream delivers `chatDeleted` only after that listener has passed membership at least once.

The register remains current at all five seams, but the integrated work changes the correct repair:

- #719 serialized `writeHandState` from head resolve through write
  (`packages/server/src/domain/rpg/snapshot-edit.ts:46-71,171-207`). It closes same-game hand clobbering, not
  the durable card/seat work that precedes promotion's hand re-key
  (`packages/server/src/domain/rpg/verbs/promote-actor.ts:47-87`). Promotion recovery therefore remains live.
- #720 made each imported chat and its scoped import claim atomic
  (`packages/server/src/domain/chat/persistence/import-write.ts:421-480,603-639`). That makes canon retry-safe,
  but the bundle caller still returns before overlays whenever `written[0]` is absent
  (`packages/server/src/domain/import/verbs/import-chat-bundle.ts:304-323`). The old “skip overlays” rationale is
  now stale; the residual recovery bug is live. #720's start-as-game and host-handoff work is excluded.
- #721 touched runtime and automation budgets, not these paths. It changes none of the five premises.
- `updateConfig` still writes the RPG config before its injected pointer mirror and suppresses the mirror on a
  retry because it compares against the now-updated config (`packages/server/src/domain/rpg/verbs/game/update-config.ts:121-133`).
- the turn flush still writes the snapshot before separately inserting journal rows
  (`packages/server/src/domain/rpg/chat-ops/flush.ts:188-220`), and the stream still returns `chatDeleted`
  before any membership probe (`packages/server/src/transport/trpc/stream/sources/chat.ts:156-177`).

## Chosen architecture

### Snapshot and journal: one existing batch boundary

The snapshot persistence seam will prepare either its existing-variant update or fresh insert as an unexecuted
statement after validating the complete state. `writeFlush` will validate and mint all journal rows before any
write, then commit the snapshot statement followed by all journal insert statements in one pure-write
`db.batch`. The batch helper explicitly requires write-only batches
(`packages/db/src/kit/batch.ts:8-26`), which this plan preserves. After commit, the existing variant-keyed read
returns the actual snapshot id used by the fold and emit.

This replaces the false cancellation comment that says no transaction spans the rows
(`packages/server/src/domain/rpg/chat-ops/flush.ts:307-311`). It does not absorb the later hand-row fold or the
tool-call disclosure into the batch: those are separate level-triggered recovery/observability tails and are not
part of the snapshot+journal invariant.

Rejected alternative: journal dedupe ids or a pending-flush table. Both add durable machinery to emulate the
atomicity the same database already provides, and neither is needed once all statements ride the existing batch.

### Bundle canon then replayable overlays

`BulkImportChatsResult` gains an input-aligned identity list containing both fresh and deduplicated candidates.
For a skip, chat reconstructs the identity from canon ordered by message `seq` and variant `idx`; no caller
re-derives ids. The bundle verb always runs overlays against that identity while preserving `written` as the
fresh-write-only tally used by seeders and reports.

The tag tail is already race-safe and idempotent: resolve-or-create followed by a junction
`onConflictDoNothing` (`packages/server/src/domain/tag/verbs/attach-chat-tag-by-name.ts:22-39`;
`packages/server/src/domain/tag/persistence/junctions.ts:107-112`). RPG portability import will add the matching
idempotency: an existing game for this freshly imported chat is completion, and a concurrent unique loser
re-reads the chat-keyed game before classifying the conflict. Its campaign remains one batch
(`packages/server/src/domain/rpg/persistence/portability-write.ts:120-215`). Therefore interruption after any
completed tag or after the campaign batch is repaired by replay, without duplicates.

Rejected alternatives: a cross-domain overlay outbox or another schema marker. The chat claim already durably
identifies canon, both overlay operations can be made level-triggered on existing uniqueness, and a marker would
only restate their completion state.

### Engaged config and pointer mirror

An explicitly supplied `patch.engaged` will always call `setPointer`, even when the resolved game config already
equals the requested value. The game update remains first and idempotent. A failure in the injected chat write
leaves the request retryable; the retry writes the same config and then repairs the pointer instead of skipping it.

Rejected alternative: teaching RPG to construct chat metadata statements and batching the two tables. That
widens the injected ownership seam for a two-value idempotent mirror, while unconditional replay closes the
actual interruption state.

### Character/seat then actor re-key

The promotion's stable operation key is a SHA-256 over version, chat id, and source actor key. Character's
existing provenance columns store that key and an internal `rpg-promotion:` source string through the existing
character `create` front door. The compose operation first resolves the host's card by this key. If absent, it
uses the existing deterministic free-handle search and creates the card with that provenance; a handle-conflict
race re-reads the key and accepts only the winning marked card. It then calls the already-idempotent character
seat door (`packages/server/src/domain/chat/verbs/roster.ts:545-585`).

The roster-name refusal moves into this recovery-aware durable operation: an unrelated same-name actor still
refuses before any new write, while the exact marked card is excluded from the collision on retry. Once the
operation returns its stable character id, the existing serialized `writeHandState` re-key runs. Retrying after
card creation, after seating, or after a failed re-key reuses the card and seat, then completes the actor move.

Rejected alternatives:

- re-key before mint is impossible because the target character id does not exist;
- one cross-domain character/chat/RPG batch would require converting three public verbs and the dynamic hand
  head resolution into statement planners, a broad coordinator for one workflow;
- treating any same-name roster character as the retry candidate can steal an unrelated actor. The provenance
  key distinguishes the exact durable result without a schema addition.

### Deletion metadata authorization history

The room pump initializes an `authorizedOnce` latch from the attach membership probe. Every later successful
membership probe raises it permanently for that listener. `chatDeleted` remains gate-free only when the latch is
true, preserving the already-authorized/kicked subscriber behavior that exists because deletion removes the row
before fan-out (`packages/server/src/transport/trpc/stream/sources/chat.ts:156-165`). A listener that attached to
a nonexistent/draft room and never passed membership receives no deletion bit.

Rejected alternative: re-probing membership on deletion. The row is already gone, so it necessarily answers
not-found for authorized and unauthorized listeners alike and would suppress the legitimate death notice.

## Coupled-site inventory

- Flush: RPG snapshot persistence, journal statement construction, `chat-ops/flush.ts`, and the focused flush
  integration suite.
- Bundle: chat bulk-import contract/result and persistence, import bundle verb/harness, RPG portability writer,
  chat import DB integration, bundle mapping, and fresh-box round-trip tests.
- Config: RPG update-config verb and integration suite.
- Promotion: RPG context contract/verb, compose dependencies, character provenance lookup/create and chat seat
  front doors, RPG test harness, focused verb suite, and composed-real RPG integration.
- Stream: chat room source plus isolated and fresh-DB stream source suites.
- Shared literals/contracts: repo-wide test-tree grep for `written`, the new identity field, promotion provenance
  prefix, and `chatDeleted`; update every typed fixture that constructs the changed result/input shapes.
- No DB schema, baseline, or migration files are touched. If implementation disproves that premise, stop for a
  ruling rather than modifying the active merge window's baseline.

## Red-first and verification plan

1. Install a temporary SQLite trigger that aborts journal insertion. On old source the snapshot survives; after
   the batch repair neither snapshot nor journal survives. Remove the trigger, retry the same turn, and assert one
   complete snapshot+journal pair plus post-commit events.
2. Interrupt a bundle after its tag tail but before RPG import. Retry the same bytes into a fresh DB and assert
   one chat, one tag junction, one complete RPG campaign, and correctly reconstructed message/variant re-links.
   Retry once more after campaign completion to prove no duplicates.
3. Make `setPointer` throw on its first call after the game update. Assert the config changed while the mirror did
   not, retry, then assert both converge and a later retry stays idempotent.
4. Plant the production promotion provenance/card through the real character front door with no seat, then retry
   the RPG verb and assert one card, one seat, and one re-keyed actor. Repeat with both card and seat planted to
   prove the later interruption boundary. A fake writeHandState failure followed by retry pins the final boundary.
5. Attach a never-authorized stream, publish `chatDeleted`, then publish an event after a successful gate. Old
   source yields deletion first; repaired source yields only the authorized event. Keep the fresh-DB
   authorized-then-kicked deletion test green.
6. Run only the focused RPG flush/config/promotion, chat import/bundle portability, and chat stream behavioral/DB
   suites. Run touched package typechecks and lint. Do not run whole static/structure/check-gates/full/hooks.
