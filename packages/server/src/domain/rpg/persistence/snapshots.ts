// domain/rpg/persistence/snapshots — the per-swipe tracker lifecycle (rpg-design/05 §2.4-2.5). QUERIES ONLY;
// the swipe-safety CONTRACT lives here as pointer walks over the D26 variant model:
//   • parse-on-read — every JSON column re-validated through its `@orb/contracts/rpg` schema; a corrupt row
//     is a typed `RpgStateCorruptError`, never a silent default (the constitution's no-swallow rule).
//   • resolveSnapshotForTurn — the 4-rung resolution ladder (regen-sibling → visible-selected → committed →
//     any); the `selectedVariantId` pointer already encodes "visible", so the ladder is variant-pointer walks.
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
  rpgWeatherSchema,
  rpgWidgetValueSchema,
} from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messages, rpgSnapshots } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId, RpgGameId, RpgSnapshotId } from "@orb/kit/ids";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { z } from "zod";
import { RpgStateCorruptError } from "../contract/errors";
import type { ForwardSnapshotTarget, ResolveSnapshotOpts, SnapshotGameRef } from "../contract/params";
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
const widgetValuesSchema = z.record(z.string(), rpgWidgetValueSchema);

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
    widgetValues: field(widgetValuesSchema, row.widgetValues ?? {}, id, "widgetValues"),
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

/** The snapshot keyed on its durable `id`, parsed, or `undefined` — the checkpoint-restore base reader (a
 *  checkpoint may point at the BORN seed, whose `variantId` is null, so the swipe-key reader can't reach it;
 *  restore reads by the durable snapshot id instead). */
export async function findSnapshotById(db: Db, id: RpgSnapshotId): Promise<RpgSnapshotRow | undefined> {
  const rows = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.id, id)).limit(LIMIT_ONE);
  return rows[0] ? parseSnapshotRow(rows[0]) : undefined;
}

/** The last VISIBLE assistant message's selected-variant snapshot (rung 2), excluding a regen message. */
async function lastVisibleAssistantSnapshot(db: Db, chatId: ChatId, excludeMessageId?: MessageId): Promise<RpgSnapshotRow | undefined> {
  const conds = [eq(messages.chatId, chatId), eq(messages.role, "assistant"), eq(messages.excludedFromPrompt, false)];
  if (excludeMessageId !== undefined) {
    conds.push(ne(messages.id, excludeMessageId));
  }
  const rows = await db
    .select({ selectedVariantId: messages.selectedVariantId })
    .from(messages)
    .where(and(...conds))
    .orderBy(desc(messages.seq))
    .limit(LIMIT_ONE);
  const sel = rows[0]?.selectedVariantId ?? undefined;
  return sel ? findSnapshotByVariant(db, sel) : undefined;
}

/** Rung 1 — a regen/swipe target's CURRENTLY-selected sibling snapshot (≠ the new variant). Returns
 *  `undefined` when the target has no selected sibling or the sibling IS the excluded new variant. */
async function regenSiblingSnapshot(db: Db, regenMessageId: MessageId, excludeVariantId?: MessageVariantId): Promise<RpgSnapshotRow | undefined> {
  const rows = await db.select({ selectedVariantId: messages.selectedVariantId }).from(messages).where(eq(messages.id, regenMessageId)).limit(LIMIT_ONE);
  const sel = rows[0]?.selectedVariantId ?? undefined;
  return sel && sel !== excludeVariantId ? findSnapshotByVariant(db, sel) : undefined;
}

/** The resolution base for a turn (rpg-design/05 §2.4). Walks the ladder: (1) regen/swipe → the message's
 *  currently-selected sibling (≠ the new variant); (2) the last visible assistant selected variant; (3)
 *  latest committed by `createdAt`; (4) latest any. Returns `undefined` for a game with no snapshot rows yet
 *  (D108 no-born-seed: createGame stores NO snapshot; a turnless game has zero rows). The caller synthesizes
 *  the born-default from config on `undefined` (`extractionBase`/`getTrackerView` → `defaultSnapshotState`) —
 *  so rung 4's undefined is the LIVE born-default path, not a dead branch. */
export async function resolveSnapshotForTurn(db: Db, game: SnapshotGameRef, opts: ResolveSnapshotOpts = {}): Promise<RpgSnapshotRow | undefined> {
  if (opts.regenMessageId !== undefined) {
    const sibling = await regenSiblingSnapshot(db, opts.regenMessageId, opts.excludeVariantId);
    if (sibling) {
      return sibling;
    }
  }
  const visible = await lastVisibleAssistantSnapshot(db, game.chatId, opts.regenMessageId);
  if (visible) {
    return visible;
  }
  const committed = await db
    .select()
    .from(rpgSnapshots)
    .where(and(eq(rpgSnapshots.gameId, game.id), eq(rpgSnapshots.committed, COMMITTED)))
    .orderBy(desc(rpgSnapshots.createdAt), desc(rpgSnapshots.id))
    .limit(LIMIT_ONE);
  if (committed[0]) {
    return parseSnapshotRow(committed[0]);
  }
  const any = await db
    .select()
    .from(rpgSnapshots)
    .where(eq(rpgSnapshots.gameId, game.id))
    .orderBy(desc(rpgSnapshots.createdAt), desc(rpgSnapshots.id))
    .limit(LIMIT_ONE);
  return any[0] ? parseSnapshotRow(any[0]) : undefined;
}

/** The turn's prev→current snapshot PAIR on the selected lineage (parity-plus §2.7 — the delta block's input).
 *  `cur` is the resolution-ladder head (the same snapshot the tracker view projects from); `prev` is the
 *  snapshot ONE committed beat back on the SAME lineage — the last visible assistant selected variant strictly
 *  before `cur`'s message (`findLastAssistantSelectedVariant`, the existing `onUserCommit` lineage walk). Both
 *  ends re-resolve on the currently-selected chain, so a swipe re-selects prev+current together — the delta is
 *  swipe-consistent for FREE (§2.7). `prev` is `undefined` when `cur` is the FIRST snapshot on the lineage (no
 *  prior visible assistant beat — the delta renders the first-state form or omits) OR when `cur` is undefined (a
 *  turnless game — no rows yet; the caller synthesizes the born default and gets a first-snapshot delta). */
export async function resolveTurnSnapshotPair(db: Db, game: SnapshotGameRef): Promise<{ cur: RpgSnapshotRow | undefined; prev: RpgSnapshotRow | undefined }> {
  const cur = await resolveSnapshotForTurn(db, game);
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
    widgetValues: state.widgetValues,
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
      | "widgetValues"
      | "quests"
      | "plot"
      | "fieldLocks"
    >
  >,
): Promise<void> {
  await db.update(rpgSnapshots).set(patch).where(eq(rpgSnapshots.variantId, variantId));
}
