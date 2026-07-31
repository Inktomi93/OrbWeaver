// domain/rpg/persistence/snapshots — the per-swipe tracker lifecycle (rpg-design/05 §2.4-2.5). QUERIES ONLY;
// the swipe-safety CONTRACT lives here as pointer walks over the D26 variant model:
//   • parse-on-read — every JSON column re-validated through its `@orb/contracts/rpg` schema; a corrupt row
//     is a typed `RpgStateCorruptError`, never a silent default (the constitution's no-swallow rule).
//   • resolveSnapshotForTurn — the HEAD ladder (visible-selected → committed → any); the `selectedVariantId`
//     pointer already encodes "visible", so the ladder is variant-pointer walks.
//   • resolveSnapshotBeforeSlot — the state as of the slot BEFORE a turn: its WRITE base always (VER-1a — a
//     reroll's new variant never inherits its own slot's rejected variant) AND its READ base on a REGEN
//     (VER-1b — the reminder/delta a reroll is generated against must not describe the abandoned variant).
//   • writeStagedSnapshot / writeRestoredSnapshot — clone-forward: a new variant's snapshot inherits ALL
//     fields from its resolution base (staged born committed=0; restore born committed=1). `fieldLocks`
//     carry forward from the base unchanged (tools never author locks — only `editSnapshot` does, W1b).
//   • commitSnapshotForVariant — `onUserCommit` locks in the state the user was seeing (committed 0 → 1).
//
// Reads `messages`/`message_variants` (rpg_snapshots FKs both) for the pointer walk — legitimate state
// resolution, distinct from the membership auth chokepoint (that rides the injected `chat.getMembership` op,
// W1b). No `now` ambient clock: every write takes `target.now` injected (determinism, §6.2).

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import {
  rpgActorVolatileSchema,
  rpgClockTimeSchema,
  rpgFieldLocksSchema,
  rpgPlotSchema,
  rpgPresentCharacterSchema,
  rpgQuestSchema,
  rpgSnapshotStateSchema,
  rpgTrackerValuesSchema,
  rpgWeatherSchema,
} from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messages, rpgSnapshots } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId, RpgGameId, RpgSnapshotId } from "@orb/kit/ids";
import { and, count, desc, eq, lt, ne } from "drizzle-orm";
import { z } from "zod";
import { RpgStateCorruptError } from "../contract/errors";
import type { ForwardSnapshotTarget, SnapshotGameRef } from "../contract/params";
import type { NewRpgSnapshot, RpgSnapshotRow, WriteStagedSnapshotResult } from "../contract/service";
import { snapshotRowToState } from "../contract/service";

const LIMIT_ONE = 1;
const COMMITTED = 1;
const UNCOMMITTED = 0;

// The array/record JSON columns whose element schema `@orb/contracts/rpg` exports singular.
const presentCharactersSchema = z.array(rpgPresentCharacterSchema);
const recentEventsSchema = z.array(z.string());
const actorStateSchema = z.array(rpgActorVolatileSchema);
const questsSchema = z.array(rpgQuestSchema);

/** Validate one JSON column through its contract schema. A schema-invalid persisted blob is a typed
 *  `RpgStateCorruptError` — surfaced loudly, never defaulted away into a poisoned tracker. */
function field<T>(schema: z.ZodType<T>, value: unknown, id: string, name: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new RpgStateCorruptError("rpg_snapshots", id, `${name}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Re-validate every JSON column. drizzle `mode:"json"` already `JSON.parse`d + typed the row; this catches
 *  STRUCTURAL corruption a raw cast would let through. Nullable-array columns (born null on an empty seed)
 *  parse to `[]` via the schema default so downstream reads are total. */
function parseSnapshotRow(row: RpgSnapshotRow): RpgSnapshotRow {
  const { id } = row;
  return {
    ...row,
    clock: row.clock === null ? null : field(rpgClockTimeSchema, row.clock, id, "clock"),
    weather: row.weather === null ? null : field(rpgWeatherSchema, row.weather, id, "weather"),
    presentCharacters: field(presentCharactersSchema, row.presentCharacters ?? [], id, "presentCharacters"),
    recentEvents: field(recentEventsSchema, row.recentEvents ?? [], id, "recentEvents"),
    actorState: field(actorStateSchema, row.actorState ?? [], id, "actorState"),
    trackerValues: field(rpgTrackerValuesSchema, row.trackerValues ?? {}, id, "trackerValues"),
    quests: field(questsSchema, row.quests ?? [], id, "quests"),
    plot: row.plot === null ? null : field(rpgPlotSchema, row.plot, id, "plot"),
    fieldLocks: row.fieldLocks === null ? null : field(rpgFieldLocksSchema, row.fieldLocks, id, "fieldLocks"),
  };
}

/** The snapshot keyed on `variantId` (the UNIQUE swipe key), parsed, or `undefined`. */
export async function findSnapshotByVariant(db: Db, variantId: MessageVariantId): Promise<RpgSnapshotRow | undefined> {
  const rows = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, variantId)).limit(LIMIT_ONE);
  return rows[0] ? parseSnapshotRow(rows[0]) : undefined;
}

/** EVERY snapshot row for a game (all swipe variants), parsed — the fork-clone source read (§3.2). NOT
 *  lineage-projected: the clone re-keys each row through the fork's `variantIdMap` and DROPS any whose variant
 *  wasn't copied (past the fork horizon / below the floor), so it must see the whole set, not the selected chain. */
export async function listSnapshots(db: Db, gameId: RpgGameId): Promise<readonly RpgSnapshotRow[]> {
  const rows = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId));
  return rows.map(parseSnapshotRow);
}

/** The count of snapshots a game has written — the reconcile-cadence BEAT COUNTER (crunchy-cluster §1.3): every
 *  `reconcileEveryBeats`-th flush is a reconcile beat (`count % N === 0`). Derived (never a stamped counter) off
 *  the table the flush already writes; a cheap `COUNT(*)`, not a row scan. Read at `stageStateRound` BEFORE this
 *  flush's own write, so the count is the number of PRIOR beats. */
export async function countSnapshots(db: Db, gameId: RpgGameId): Promise<number> {
  const rows = await db.select({ n: count() }).from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId));
  return rows.at(0)?.n ?? 0;
}

/** The snapshot keyed on its durable `id`, parsed, or `undefined` — the checkpoint-restore base reader (a
 *  checkpoint may point at the BORN seed, whose `variantId` is null, so the swipe-key reader can't reach it;
 *  restore reads by the durable snapshot id instead). */
export async function findSnapshotById(db: Db, id: RpgSnapshotId): Promise<RpgSnapshotRow | undefined> {
  const rows = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.id, id)).limit(LIMIT_ONE);
  return rows[0] ? parseSnapshotRow(rows[0]) : undefined;
}

/** The last VISIBLE assistant message's selected-variant snapshot (the head's rung 1). */
async function lastVisibleAssistantSnapshot(db: Db, chatId: ChatId): Promise<RpgSnapshotRow | undefined> {
  const rows = await db
    .select({ selectedVariantId: messages.selectedVariantId })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "assistant"), eq(messages.excludedFromPrompt, false)))
    .orderBy(desc(messages.seq))
    .limit(LIMIT_ONE);
  const sel = rows[0]?.selectedVariantId ?? undefined;
  return sel ? findSnapshotByVariant(db, sel) : undefined;
}

/** The GAME-WIDE fallback rungs: latest COMMITTED by `createdAt`, else latest ANY. `excludeMessageId` drops
 *  every snapshot keyed to that assistant SLOT — the flushing turn's own slot, whose sibling variants are
 *  precisely the ones a new variant must not inherit (VER-1a). */
async function latestSnapshot(db: Db, gameId: RpgGameId, excludeMessageId?: MessageId): Promise<RpgSnapshotRow | undefined> {
  const scope = [eq(rpgSnapshots.gameId, gameId), ...(excludeMessageId !== undefined ? [ne(rpgSnapshots.messageId, excludeMessageId)] : [])];
  const committed = await db
    .select()
    .from(rpgSnapshots)
    .where(and(...scope, eq(rpgSnapshots.committed, COMMITTED)))
    .orderBy(desc(rpgSnapshots.createdAt), desc(rpgSnapshots.id))
    .limit(LIMIT_ONE);
  if (committed[0]) {
    return parseSnapshotRow(committed[0]);
  }
  const any = await db
    .select()
    .from(rpgSnapshots)
    .where(and(...scope))
    .orderBy(desc(rpgSnapshots.createdAt), desc(rpgSnapshots.id))
    .limit(LIMIT_ONE);
  return any[0] ? parseSnapshotRow(any[0]) : undefined;
}

/** The resolution HEAD — the state the panel/reminder/hand-edit read (rpg-design/05 §2.4). Walks the ladder:
 *  (1) the last visible assistant slot's SELECTED variant (the swipe pointer — a swipe re-resolves the head
 *  with zero writes); (2) latest committed by `createdAt`; (3) latest any. Returns `undefined` for a game with
 *  no snapshot rows yet (D108 no-born-seed: createGame stores NO snapshot; a turnless game has zero rows). The
 *  caller synthesizes the born-default from config on `undefined` (`getTrackerView` → `defaultSnapshotState`)
 *  — so the last rung's undefined is the LIVE born-default path, not a dead branch.
 *
 *  This is the HEAD, never a turn's write BASE: a turn that is about to produce a NEW variant on a slot must
 *  resolve {@link resolveSnapshotBeforeSlot} instead, or it re-applies its own slot's abandoned variant. */
export async function resolveSnapshotForTurn(db: Db, game: SnapshotGameRef): Promise<RpgSnapshotRow | undefined> {
  const visible = await lastVisibleAssistantSnapshot(db, game.chatId);
  if (visible) {
    return visible;
  }
  return latestSnapshot(db, game.id);
}

/** The EXTRACTION BASE for a turn writing onto `messageId` — the state as of the slot BEFORE this turn
 *  (VER-1a). A reroll mints a NEW variant on an EXISTING slot, and the rejected variant's snapshot already
 *  carries that slot's extraction applied over this same base; resolving the head would hand the new
 *  variant its sibling's consequences as base, so the fresh extraction would apply ON TOP (the live-confirmed
 *  duplicate-beat class: three near-identical "Niko was touched" journal beats from rerolling one turn).
 *  Excluding the slot makes a variant's snapshot ABSOLUTE per variant — the pre-slot base plus THIS variant's
 *  delta, nothing else. A swipe then surfaces exactly the selected variant's consequences, and a first-generation turn
 *  (a fresh slot with no snapshots) resolves byte-identically to the head.
 *
 *  Rung 1 is the seq-bounded lineage walk (the last visible assistant SELECTED variant strictly before this
 *  slot — the same walk `onUserCommit` uses), so rerolling a MID-chat message bases on its predecessor, never
 *  on a downstream beat. The game-wide fallbacks (committed → any) still exclude this slot's own rows. */
export async function resolveSnapshotBeforeSlot(db: Db, game: SnapshotGameRef, messageId: MessageId): Promise<RpgSnapshotRow | undefined> {
  const seq = await findMessageSeq(db, messageId);
  if (seq !== undefined) {
    const prevVariant = await findLastAssistantSelectedVariant(db, game.chatId, seq);
    const prev = prevVariant !== undefined ? await findSnapshotByVariant(db, prevVariant) : undefined;
    if (prev) {
      return prev;
    }
  }
  return latestSnapshot(db, game.id, messageId);
}

/** The turn's prev→current snapshot PAIR on the selected lineage (parity-plus §2.7 — the delta block's input).
 *  `cur` is the state this turn reads (the head — or, on a REGEN, the state as of before the regenerated slot;
 *  see `beforeMessageId`), the same snapshot the tracker view projects from; `prev` is the
 *  snapshot ONE committed beat back on the SAME lineage — the last visible assistant selected variant strictly
 *  before `cur`'s message (`findLastAssistantSelectedVariant`, the existing `onUserCommit` lineage walk). Both
 *  ends re-resolve on the currently-selected chain, so a swipe re-selects prev+current together — the delta is
 *  swipe-consistent for FREE (§2.7). `prev` is `undefined` when `cur` is the FIRST snapshot on the lineage (no
 *  prior visible assistant beat — the delta renders the first-state form or omits) OR when `cur` is undefined (a
 *  turnless game — no rows yet; the caller synthesizes the born default and gets a first-snapshot delta).
 *
 *  VER-1b — `beforeMessageId` is the slot a REGEN (swipe/reroll) is about to write a new variant onto: `cur`
 *  then resolves {@link resolveSnapshotBeforeSlot} instead of the head, so the pair is the SAME prev→cur the
 *  slot's FIRST generation saw ("changes since the beat before this slot"), never the abandoned variant's own
 *  changes. Absent (a fresh turn) ⇒ the head, byte-identical to before. */
export async function resolveTurnSnapshotPair(
  db: Db,
  game: SnapshotGameRef,
  beforeMessageId?: MessageId,
): Promise<{ cur: RpgSnapshotRow | undefined; prev: RpgSnapshotRow | undefined }> {
  const cur = beforeMessageId === undefined ? await resolveSnapshotForTurn(db, game) : await resolveSnapshotBeforeSlot(db, game, beforeMessageId);
  if (cur === undefined) {
    return { cur: undefined, prev: undefined };
  }
  const curSeq = await findMessageSeq(db, cur.messageId);
  if (curSeq === undefined) {
    return { cur, prev: undefined };
  }
  const prevVariant = await findLastAssistantSelectedVariant(db, game.chatId, curSeq);
  const prev = prevVariant !== undefined ? await findSnapshotByVariant(db, prevVariant) : undefined;
  return { cur, prev };
}

/** Insert a snapshot row (the born-committed seed at createGame / checkpoint restore, or a forwarded row),
 *  returning it parsed. The JSON values arrive already-typed (from a parsed base or a validated config), so
 *  the read-side parse on the returned row is the corruption belt. */
export async function insertSnapshot(db: Db, values: NewRpgSnapshot): Promise<RpgSnapshotRow> {
  const rows = await db.insert(rpgSnapshots).values(values).returning();
  const row = rows[0];
  if (!row) {
    throw new Error("insertSnapshot: no row returned");
  }
  return parseSnapshotRow(row);
}

/** Compose a snapshot INSERT from an effective state + a target (the shared body of the staged/restored
 *  writers). `committed` + `fieldLocks` differ per writer (staged carries locks forward from the base;
 *  restore likewise; both born from the base's locks — tools never author locks). */
function snapshotInsertFrom(
  state: RpgSnapshotState,
  fieldLocks: RpgSnapshotState["fieldLocks"],
  committed: number,
  target: ForwardSnapshotTarget,
): NewRpgSnapshot {
  return {
    id: target.id,
    gameId: target.gameId,
    messageId: target.messageId,
    variantId: target.variantId,
    clock: state.clock,
    calendarDate: state.calendarDate,
    location: state.location,
    weather: state.weather,
    presentCharacters: state.presentCharacters,
    recentEvents: state.recentEvents,
    actorState: state.actorState,
    trackerValues: state.trackerValues,
    quests: state.quests,
    plot: state.plot,
    fieldLocks,
    committed,
    createdAt: target.now,
  };
}

/** The Option-A turn flush: write the turn's accumulated effective state as a NEW snapshot keyed to the
 *  COMMITTED assistant variant, born `committed=0` (the next user send's `onUserCommit` locks it in). The
 *  state arrives locks-honored (the accumulator applied `applyLockedPatch` at stage time); `fieldLocks`
 *  carry forward on the state (tools never author locks — only `editSnapshot` does, W1b).
 *
 *  STRUCTURAL canon-corruption backstop (stickler F1): validate the to-be-written state against the FULL
 *  contract schema BEFORE the durable insert. The parse-on-read belt fires AFTER `insertSnapshot` commits, so
 *  an applier bug (present OR future) producing a contract-violating state would poison the row permanently
 *  and brick every later read. This gate makes "canon NEVER corrupted" STRUCTURAL, not a per-applier promise.
 *
 *  Returns `{ok:false, reason}` when the state is contract-INVALID — the caller DROPS the delta (errors-as-data,
 *  mirroring reliable-mode's non-conforming empty-delta path), never commits a poisoned row, AND LOGS the
 *  reason (the drop is observable, never silent). */
export async function writeStagedSnapshot(db: Db, state: RpgSnapshotState, target: ForwardSnapshotTarget): Promise<WriteStagedSnapshotResult> {
  const parsed = rpgSnapshotStateSchema.safeParse(state);
  if (!parsed.success) {
    // The full field-path + reason (e.g. `actorState.0.pools.0.max: expected >= 1`) — the drop's WHY.
    return { ok: false, reason: parsed.error.message };
  }
  const row = await insertSnapshot(db, snapshotInsertFrom(state, state.fieldLocks, UNCOMMITTED, target));
  return { ok: true, row };
}

/** The host RESYNC write (crunchy-cluster §1.3): the reconciled effective state onto a fresh state-anchor slot,
 *  BORN COMMITTED (the host deliberately re-derived the panel; it is the truth immediately, like a restore — not
 *  a swipe-volatile `committed=0` staged write). The state arrives locks-honored (the verb applied
 *  `applyLockedPatch` — a resync never clobbers a hand-pin); `fieldLocks` carry forward on the state.
 *
 *  Rides the SAME F1 write-boundary backstop as `writeStagedSnapshot`: validate the state against the full
 *  contract schema BEFORE the durable insert, so a resync can never poison a row (errors-as-data — the verb
 *  drops on `{ok:false}`). */
export async function writeResyncedSnapshot(db: Db, state: RpgSnapshotState, target: ForwardSnapshotTarget): Promise<WriteStagedSnapshotResult> {
  const parsed = rpgSnapshotStateSchema.safeParse(state);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.message };
  }
  const row = await insertSnapshot(db, snapshotInsertFrom(state, state.fieldLocks, COMMITTED, target));
  return { ok: true, row };
}

/** Checkpoint restore: clone a pointed snapshot onto a fresh narrator message, BORN COMMITTED (locks
 *  preserved). Same clone as forward, but `committed=1` — the restored scene is the truth immediately. */
export function writeRestoredSnapshot(db: Db, base: RpgSnapshotRow, target: ForwardSnapshotTarget): Promise<RpgSnapshotRow> {
  return insertSnapshot(db, snapshotInsertFrom(snapshotRowToState(base), base.fieldLocks, COMMITTED, target));
}

/** Lock in the state the user was seeing: set `committed=1` on one variant's snapshot (`onUserCommit`). */
export async function commitSnapshotForVariant(db: Db, variantId: MessageVariantId): Promise<void> {
  await db.update(rpgSnapshots).set({ committed: COMMITTED }).where(eq(rpgSnapshots.variantId, variantId));
}

/** The `seq` of a message (the just-committed user message — `onUserCommit`), or `undefined` if it vanished
 *  (a racing delete). Used to locate the assistant slot the user was replying to (the seq strictly below it). */
export async function findMessageSeq(db: Db, messageId: MessageId): Promise<number | undefined> {
  const rows = await db.select({ seq: messages.seq }).from(messages).where(eq(messages.id, messageId)).limit(LIMIT_ONE);
  return rows[0]?.seq;
}

/** The selected variant of the last VISIBLE assistant message strictly BEFORE `userSeq` — the snapshot the user
 *  was replying to when they sent (`onUserCommit` locks it in). `undefined` when there is no prior assistant
 *  slot (the game's first user turn). */
export async function findLastAssistantSelectedVariant(db: Db, chatId: ChatId, userSeq: number): Promise<MessageVariantId | undefined> {
  const rows = await db
    .select({ selectedVariantId: messages.selectedVariantId })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "assistant"), eq(messages.excludedFromPrompt, false), lt(messages.seq, userSeq)))
    .orderBy(desc(messages.seq))
    .limit(LIMIT_ONE);
  return rows[0]?.selectedVariantId ?? undefined;
}

/** In-place edit of a snapshot's mutable state columns by `variantId` (the `editSnapshot` hand-edit + the
 *  console direct-commit arms, W1b). Only the provided columns are written; the edit rides the selected
 *  variant. Homed here (the snapshot query surface) so W1b's verb composes it, never re-issues the update. */
export async function updateSnapshotState(
  db: Db,
  variantId: MessageVariantId,
  patch: Partial<
    Pick<
      NewRpgSnapshot,
      | "location"
      | "calendarDate"
      | "clock"
      | "weather"
      | "presentCharacters"
      | "recentEvents"
      | "actorState"
      | "trackerValues"
      | "quests"
      | "plot"
      | "fieldLocks"
    >
  >,
): Promise<void> {
  await db.update(rpgSnapshots).set(patch).where(eq(rpgSnapshots.variantId, variantId));
}
