---
kind: design
status: archived
updated: 2026-08-30
---

# Issue 743 — RPG portability and checkpoint atomicity

Status: implementation design approved by the owner’s option-1 ruling; source base
`279df814b500c323dfb4af5e2abaa3d7aed4b44b`. The completed implementation was fast-forward reconciled,
before its one lane commit, onto canonical main `b040c8d8b9bef70b312bff91b469514084289c1a`.

## Decision

The RPG export will issue its game, sheets, snapshots, journal, recorded tool calls, and checkpoints as one
SELECT-only `Db.batch`. Each child SELECT resolves the game through the same `rpg_games.chat_id` subquery, so
the whole batch can be prepared before any result is read. This is the smallest existing bounded-snapshot
primitive: Drizzle sends one client batch, and the pinned local libSQL client executes every batch inside one
`BEGIN DEFERRED` transaction. A read-only deferred transaction never upgrades to a writer, so the
`SQLITE_BUSY_SNAPSHOT` warning for read-then-write batches does not apply. The current implementation instead
reads the game and then starts five independent reads, which permits checkpoint and snapshot rows from
different database states (`packages/server/src/domain/rpg/persistence/portability-write.ts:57-69`).

Checkpoint restore will keep the D124 hand-row shape and its visible marker boundary, but commit the marker’s
chat statements and the restored RPG snapshot statement in chat’s existing pure-write narrator batch. The RPG
snapshot builder receives the already-minted marker `messageId` and returns one unexecuted `BatchStmt`; the
chat-owned narrator operation appends that statement after its own canon/stats/media statements and executes
the existing batch once. RPG still constructs only an RPG row, chat still constructs only chat rows, and the
composition root adapts their structurally compatible callback shapes. The current two-commit sequence posts
the marker before writing the restored snapshot (`packages/server/src/domain/rpg/verbs/checkpoint/restore-checkpoint.ts:28-32`), while the existing
narrator operation already has one pure-write batch and emits only after it commits
(`packages/server/src/domain/chat/verbs/post-narrator-message.ts:92-102`).

The restore statement is a narrowly named checkpoint-restore builder, not a new transaction service. It
clones the parsed checkpoint row, preserves locks, stays born committed, and uses the marker `messageId` as
the D124 hand arm’s `asOfMessageId`. Ordinary hand writes continue to resolve their tail exactly as today.

## Substrate proof

- `Db.batch` is the repository’s sanctioned tuple bridge; Drizzle does not expose a transaction-mode
  argument and therefore uses libSQL’s deferred default (`packages/db/src/kit/batch.ts:8-26`).
- The pinned `@libsql/client` SQLite implementation executes `BEGIN`, every supplied statement, and `COMMIT`
  in one `batch` call (`node_modules/.pnpm/@libsql+client@0.17.4/node_modules/@libsql/client/lib-esm/sqlite3.js:85-112`).
- The repository warning forbids a SELECT before writes because a deferred snapshot upgrade can fail; it does
  not forbid a SELECT-only batch (`packages/db/src/kit/batch.ts:19-26`). Export is SELECT-only and restore is
  pure-write.
- D124 requires non-turn state to remain a message-less hand row and makes its ordering stamp explicit in the
  snapshot persistence home (`packages/server/src/domain/rpg/persistence/snapshots.ts:566-601`). The marker is
  visible prose, not a variant-keyed state anchor.
- D136 requires checkpoint references to be positional within the exported snapshot array and treats silent
  mis-anchoring as worse than loss. One database
  snapshot is therefore part of export correctness, not an optimization.

The substrate can safely provide the requested bounded read snapshot. No owner fork is required.

## Rejected alternatives

1. **`db.transaction()` or a new transaction abstraction.** Rejected. The repository bans the interactive
   transaction arm because connection replacement and `:memory:` behavior can split the apparent transaction.
   It would also be a generic framework for two bounded operations already served by `Db.batch`.
2. **Read-and-validate retries or bundle version stamps.** Rejected. They add a new concurrency protocol and
   still have to define a stable validation horizon. The owner chose database atomicity, and the existing
   substrate supplies it directly.
3. **One large join.** Rejected. Joining six one-to-many tables creates a cross-product that must be de-duplicated
   and re-ordered in memory. Six ordered SELECTs in one batch preserve the existing projections exactly.
4. **Move RPG snapshot construction into chat or let RPG write chat tables.** Rejected. Both violate the
   injected-op boundary. The one-statement callback keeps row construction in the owning domains while the
   already-owning narrator operation remains the sole commit/emit door.
5. **Stamp the restored snapshot at the pre-marker tail.** Rejected. It could make both statements independent,
   but changes the existing user-visible ordering semantics. Passing the already-minted marker ID to the
   restore statement preserves the current “state as of the restore line” behavior.

## Coupled-site inventory

- `packages/server/src/domain/rpg/persistence/portability-write.ts`: replace independent export reads with one
  SELECT-only batch; import stays unchanged.
- `tests/server/domain/rpg/persistence/portability-write.int.test.ts`: add the deterministic two-connection
  concurrent export proof and retain the existing fidelity/constraint tests.
- `packages/server/src/domain/rpg/persistence/snapshots.ts`: expose the one unexecuted restored-snapshot
  statement builder; leave every other hand write unchanged.
- `packages/server/src/domain/rpg/verbs/checkpoint/restore-checkpoint.ts`: mint the snapshot ID before posting
  and supply the companion-statement builder to the narrator operation.
- `packages/server/src/domain/rpg/contract/service.ts`: truth-repair the stale state-anchor description and
  declare the restore-only companion callback.
- `packages/server/src/domain/chat/contract/context.ts` and
  `packages/server/src/domain/chat/verbs/post-narrator-message.ts`: add one optional RPG-restore companion
  statement arm to the existing fourth-argument options union and narrator batch; all other callers retain
  their existing origin arm and remain byte-identical.
- `packages/server/src/entry/compose/rpg.ts`: adapt RPG’s required restore callback to chat’s optional fifth
  fourth-argument restore-options arm without importing sibling implementation.
- `tests/server/domain/rpg/_support.ts`: make the RPG fake execute the required companion statement so existing
  verb tests keep exercising the new contract; atomicity itself is proved through the real chat operation.
- `tests/server/domain/rpg/verbs/checkpoint/restore-checkpoint.int.test.ts`: use the real narrator writer for
  injected marker/snapshot failures, rollback visibility, and successful retry convergence.
- `tests/server/domain/chat/verbs/post-narrator-message.int.test.ts`: retain existing caller behavior and pin
  companion inclusion/rollback only if the RPG restore integration proof cannot observe the chat side directly.

No schema, migration, wire field, user-facing text, or generic DB helper changes are required.

## Red-first and behavioral proof

1. **Concurrent export:** use a file-backed database with two libSQL connections. A client wrapper triggers a
   writer between snapshot and checkpoint reads on the old multi-call implementation, replacing a checkpoint’s
   target with a newly inserted snapshot. Both valid database states contain one checkpoint; a mixed export
   omits it because its target is absent from the exported snapshot array. Assert the export always contains
   exactly one checkpoint and that its position names an exported snapshot. This fails deterministically on
   the old source and passes when all six reads share one batch snapshot.
2. **Marker failure:** wire the real chat narrator operation, inject a duplicate marker/variant ID, and assert
   neither the marker nor the restored snapshot becomes visible.
3. **Snapshot failure:** inject a duplicate RPG snapshot ID so the final companion statement fails; assert the
   preceding canon/statements roll back and neither half becomes visible.
4. **Retry convergence:** after either injected failure, retry with fresh IDs; assert exactly one visible
   restore marker and exactly one new restored snapshot, with the checkpointed state, born committed, stamped
   at that marker.
5. **Regression:** run the existing RPG portability and checkpoint-restore behavioral files plus the focused
   chat narrator file, then scoped type/lint checks for touched files/programs. Do not run full/static/structure,
   gate, or hook batteries in this lane.

## Assumptions and limits

- A restore retry is recovery from a failed transaction, not idempotency after a successful transaction; the
  public verb carries no operation/request ID, so two successful clicks remain two intentional restore events.
- `claimChat` and lazy group-character minting precede the narrator batch. They are idempotent prerequisites,
  not either half of the required marker/snapshot pair; the atomicity claim is limited to the visible marker
  and restored snapshot selected by issue 743.
- The design used no project-memory lesson: the required quick pass found no RPG portability/checkpoint/libSQL
  entry, so every decision above is based on current source, repository law, and the pinned installed client.
