// domain/rpg/persistence/snapshots — the per-swipe tracker lifecycle (rpg-design/05 §2.4-2.5). QUERIES ONLY;
// the swipe-safety CONTRACT lives here as pointer walks over the D26 variant model:
//   • parse-on-read — every JSON column re-validated through its `@orb/contracts/rpg` schema; a corrupt row
//     is a typed `RpgStateCorruptError`, never a silent default (the constitution's no-swallow rule).
//   • resolveSnapshotForTurn — the HEAD ladder (the ladder head → committed → any). `resolveSnapshotHead` is
//     its full form: the same walk plus WHICH arm answered and at what seq, because "is this row at the ladder's
//     TIP" is a different question from "which row is head" — see its doc for the two callers that need it.
//   • resolveSnapshotBeforeSlot — the state as of the slot BEFORE a turn: its WRITE base always (VER-1a — a
//     reroll's new variant never inherits its own slot's rejected variant) AND its READ base on a REGEN
//     (VER-1b — the reminder/delta a reroll is generated against must not describe the abandoned variant).
//   • writeStagedSnapshot — the TURN arm: a new variant's snapshot inherits ALL fields from its resolution
//     base, born committed=0. `writeHandSnapshot`/`writeResyncedSnapshot`/`writeRestoredSnapshot` — the HAND
//     arm, born committed=1. `fieldLocks` carry forward from the base unchanged (tools never author locks —
//     only `editSnapshot` does, W1b).
//   • commitSnapshotForVariant — `onUserCommit` locks in the state the user was seeing (committed 0 → 1).
//
// THE TWO-ARM LAW (D124) AND THE ORDER IT IMPLIES. A snapshot is VARIANT-KEYED IFF it was produced by that
// variant's own turn flush; every other write is a message-less HAND ROW stamped with `asOfMessageId` (the
// chat's tail slot at write time, NULL on a turnless game). Hand rows used to buy their ladder position by
// posting an EMPTY assistant message — a non-message that every canon plane then had to filter. So the
// LADDER ORDER is no longer "message seq" alone; it is the (seq, hand-tier, createdAt, id) key {@link isLater}
// decides, and THIS FILE IS ITS ONE HOME. Two arms feed every walk:
//   • the TURN arm — the last visible assistant slot's SELECTED variant's snapshot (the swipe pointer: a
//     swipe re-resolves the head with zero writes);
//   • the HAND arm — the newest hand row at or below the walk's bound.
// A hand row sits AFTER the turn row of the same slot (you edited on top of that beat), and a burst of hand
// writes at one as-of slot orders by createdAt/id. A hand row survives a swipe of any slot — the same
// semantics the anchor slot had (an anchor was its own slot, so swiping an earlier slot never rewound it).
//
// Reads `messages`/`message_variants` (rpg_snapshots FKs both) for the pointer walk — legitimate state
// resolution, distinct from the membership auth chokepoint (that rides the injected `chat.getMembership` op,
// W1b). No `now` ambient clock: every write takes `target.now` injected (determinism, §6.2).

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import {
  rpgActorEntrySchema,
  rpgClockTimeSchema,
  rpgFieldLocksSchema,
  rpgPlotSchema,
  rpgQuestSchema,
  rpgSnapshotStateSchema,
  rpgTrackerValuesSchema,
  rpgWeatherSchema,
} from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messages, rpgSnapshots } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId, RpgGameId, RpgSnapshotId } from "@orb/kit/ids";
import { and, count, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { RpgStateCorruptError } from "../contract/errors.ts";
import type { HandSnapshotTarget, SnapshotGameRef, TurnSnapshotTarget } from "../contract/params.ts";
import type { NewRpgSnapshot, ResolvedSnapshotHead, RpgSnapshotRow, WriteStagedSnapshotResult } from "../contract/service.ts";
import { snapshotRowToState } from "../contract/service.ts";

const LIMIT_ONE = 1;
const COMMITTED = 1;
const UNCOMMITTED = 0;
/** A hand row whose as-of slot is NULL (a turnless game) or was floored away (the D106 fork SET NULL) orders
 *  BEFORE all history — `messages.seq` is `>= 0` (contracts `SEQ_MIN`), so -1 is below every real position.
 *  "State as of before the story started" IS the baseline posture, so that is exactly the right degrade. */
const NO_SEQ = -1;

// The array/record JSON columns whose element schema `@orb/contracts/rpg` exports singular.
// The PRESENCE plane is a flat `actorRefKey` list since R2 — the same shape `recentEvents` has, and the reason
// it no longer needs an element schema of its own.
const presentCharactersSchema = z.array(z.string().min(1));
const recentEventsSchema = z.array(z.string());
const actorStateSchema = z.array(rpgActorEntrySchema);
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

/** The snapshot keyed on its durable `id`, parsed, or `undefined` — the checkpoint-restore base reader. A
 *  checkpoint always points at a durable snapshot id, and under D124 the row it names may be a HAND row
 *  (`variantId IS NULL`) that the swipe-key reader structurally cannot reach — so restore reads by id. */
export async function findSnapshotById(db: Db, id: RpgSnapshotId): Promise<RpgSnapshotRow | undefined> {
  const rows = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.id, id)).limit(LIMIT_ONE);
  return rows[0] ? parseSnapshotRow(rows[0]) : undefined;
}

// ── THE LADDER ORDER (D124) — one home ───────────────────────────────────────────────────────────────────

/** A snapshot row's POSITION on the resolution ladder. `seq` is the story position the row is stamped at: a
 *  TURN row's own slot, a HAND row's as-of slot ({@link NO_SEQ} when it has none). `hand` breaks the tie at
 *  one position — a hand write happened ON TOP OF the beat it names. `createdAt`/`id` break the tie WITHIN a
 *  burst of hand writes at the same as-of slot. */
interface LadderPos {
  readonly seq: number;
  readonly hand: boolean;
  readonly createdAt: number;
  readonly id: RpgSnapshotId;
}

/** A candidate rung: the row plus where it sits. */
interface LadderRung {
  readonly row: RpgSnapshotRow;
  readonly pos: LadderPos;
}

/** The EXCLUSIVE bound a "strictly before" hand walk takes. `tie` present ⇒ the bound is itself a HAND
 *  position, so a sibling hand row at the SAME as-of seq qualifies only if it is older; `tie: null` ⇒ the
 *  bound is a TURN position, and no hand row at that seq is before it (a hand row sits after the turn row). */
interface HandWalkBound {
  readonly seq: number;
  readonly tie: { readonly createdAt: number; readonly id: RpgSnapshotId } | null;
}

/** `true` iff `a` is strictly later than `b` — the lexicographic (seq, hand-tier, createdAt, id) order. */
function isLater(a: LadderPos, b: LadderPos): boolean {
  if (a.seq !== b.seq) {
    return a.seq > b.seq;
  }
  if (a.hand !== b.hand) {
    return a.hand;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt > b.createdAt;
  }
  return a.id > b.id;
}

/** The later of two rungs (either may be absent) — the ONE place the two arms are merged. */
function laterRung(a: LadderRung | undefined, b: LadderRung | undefined): LadderRung | undefined {
  if (a === undefined) {
    return b;
  }
  if (b === undefined) {
    return a;
  }
  return isLater(a.pos, b.pos) ? a : b;
}

/** The exclusive walk bounds implied by a position: the assistant-slot seq the TURN arm must stay strictly
 *  below, and the HAND arm's bound. A hand position at seq S admits the turn row AT S (it sits after it), so
 *  the turn bound is S+1; a turn position at S admits neither the turn row at S nor a hand row at S. */
function boundsBefore(pos: LadderPos): { readonly turnBelow: number; readonly hand: HandWalkBound } {
  return pos.hand
    ? { turnBelow: pos.seq + 1, hand: { seq: pos.seq, tie: { createdAt: pos.createdAt, id: pos.id } } }
    : { turnBelow: pos.seq, hand: { seq: pos.seq, tie: null } };
}

/** THE TURN ARM: the last VISIBLE assistant slot's selected-variant snapshot, optionally bounded to slots
 *  strictly below `seqBelow`. The `selectedVariantId` pointer already encodes "visible", so this is a
 *  variant-pointer walk — a swipe re-resolves it with zero writes. */
async function turnRung(db: Db, chatId: ChatId, seqBelow?: number): Promise<LadderRung | undefined> {
  const rows = await db
    .select({ seq: messages.seq, selectedVariantId: messages.selectedVariantId })
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.role, "assistant"),
        eq(messages.excludedFromPrompt, false),
        ...(seqBelow === undefined ? [] : [lt(messages.seq, seqBelow)]),
      ),
    )
    .orderBy(desc(messages.seq))
    .limit(LIMIT_ONE);
  const slot = rows[0];
  const variantId = slot?.selectedVariantId ?? null;
  if (slot === undefined || variantId === null) {
    return;
  }
  const row = await findSnapshotByVariant(db, variantId);
  return row === undefined ? undefined : { row, pos: { seq: slot.seq, hand: false, createdAt: row.createdAt, id: row.id } };
}

/** THE HAND ARM: the NEWEST hand row (`variantId IS NULL`) of a game, optionally strictly before `bound`.
 *  Ordering joins `messages` through the nullable `asOfMessageId` — a row whose as-of slot is absent (never
 *  had one, or the fork's SET NULL floored it away) collapses to {@link NO_SEQ} and orders before all
 *  history, which is exactly the pre-baseline posture it represents. */
async function handRung(db: Db, gameId: RpgGameId, bound?: HandWalkBound): Promise<LadderRung | undefined> {
  const asOfSeq = sql<number>`coalesce(${messages.seq}, ${NO_SEQ})`;
  const tie = bound?.tie;
  const before =
    bound === undefined
      ? []
      : [
          tie === null || tie === undefined
            ? lt(asOfSeq, bound.seq)
            : or(
                lt(asOfSeq, bound.seq),
                and(
                  eq(asOfSeq, bound.seq),
                  or(lt(rpgSnapshots.createdAt, tie.createdAt), and(eq(rpgSnapshots.createdAt, tie.createdAt), lt(rpgSnapshots.id, tie.id))),
                ),
              ),
        ];
  const rows = await db
    .select({ snapshot: rpgSnapshots, asOfSeq })
    .from(rpgSnapshots)
    .leftJoin(messages, eq(messages.id, rpgSnapshots.asOfMessageId))
    .where(and(eq(rpgSnapshots.gameId, gameId), isNull(rpgSnapshots.variantId), ...before))
    .orderBy(desc(asOfSeq), desc(rpgSnapshots.createdAt), desc(rpgSnapshots.id))
    .limit(LIMIT_ONE);
  const hit = rows[0];
  if (hit === undefined) {
    return;
  }
  const row = parseSnapshotRow(hit.snapshot);
  return { row, pos: { seq: hit.asOfSeq, hand: true, createdAt: row.createdAt, id: row.id } };
}

/** Where a resolved row sits on the ladder — the read-side twin of the write-side arm choice. `undefined`
 *  only when a TURN row's own slot vanished (a racing delete), which is the caller's "no lineage" signal. */
async function ladderPosOf(db: Db, row: RpgSnapshotRow): Promise<LadderPos | undefined> {
  if (row.messageId !== null) {
    const seq = await findMessageSeq(db, row.messageId);
    return seq === undefined ? undefined : { seq, hand: false, createdAt: row.createdAt, id: row.id };
  }
  const asOfSeq = row.asOfMessageId === null ? undefined : await findMessageSeq(db, row.asOfMessageId);
  return { seq: asOfSeq ?? NO_SEQ, hand: true, createdAt: row.createdAt, id: row.id };
}

/** The GAME-WIDE fallback rungs: latest COMMITTED by `createdAt`, else latest ANY. `excludeMessageId` drops
 *  every snapshot keyed to that assistant SLOT — the flushing turn's own slot, whose sibling variants are
 *  precisely the ones a new variant must not inherit (VER-1a). HAND rows carry no `messageId`, so they are
 *  never that slot's siblings and must survive the exclusion (a bare `ne` on a NULL column drops them). */
async function latestSnapshot(db: Db, gameId: RpgGameId, excludeMessageId?: MessageId): Promise<RpgSnapshotRow | undefined> {
  const scope = [
    eq(rpgSnapshots.gameId, gameId),
    ...(excludeMessageId === undefined ? [] : [or(isNull(rpgSnapshots.messageId), ne(rpgSnapshots.messageId, excludeMessageId))]),
  ];
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
 *  (1) the LATER of the two arms — the last visible assistant slot's SELECTED variant (the swipe pointer — a
 *  swipe re-resolves the head with zero writes) and the newest HAND row (D124); (2) latest committed by
 *  `createdAt`; (3) latest any. Returns `undefined` for a game with no snapshot rows yet (D108 no-born-seed:
 *  createGame stores NO snapshot; a turnless game has zero rows). The caller synthesizes the born-default
 *  from config on `undefined` (`getTrackerView` → `defaultSnapshotState`) — so the last rung's undefined is
 *  the LIVE born-default path, not a dead branch.
 *
 *  This is the HEAD, never a turn's write BASE: a turn that is about to produce a NEW variant on a slot must
 *  resolve {@link resolveSnapshotBeforeSlot} instead, or it re-applies its own slot's abandoned variant. */
export async function resolveSnapshotForTurn(db: Db, game: SnapshotGameRef): Promise<RpgSnapshotRow | undefined> {
  return (await resolveSnapshotHead(db, game))?.row;
}

/** The head WITH its ladder provenance — {@link resolveSnapshotForTurn}'s full form, and the one home for the
 *  walk (the bare reader above is a thin arm of it, so the two can never disagree about which row is head).
 *
 *  WHY the provenance is public (`ResolvedSnapshotHead`): "which row is head" and "is that row at the ladder's
 *  TIP" are different questions, and two callers need the second. The hand door asks it to decide whether an
 *  UNCOMMITTED turn row may be edited IN PLACE — during an in-flight flush the tail slot has no snapshot yet
 *  (that IS in-flight), the `turn` rung comes back empty, and the `fallback` walk answers with an OLDER slot's
 *  still-uncommitted draft; editing THAT in place writes onto a row the next flush strictly outranks, and the
 *  edit is gone. The flush asks it to find a hand row shadowing the row it just wrote, and must know the seq so
 *  it folds into a hand row at its OWN slot only. */
export async function resolveSnapshotHead(db: Db, game: SnapshotGameRef): Promise<ResolvedSnapshotHead | undefined> {
  const head = laterRung(await turnRung(db, game.chatId), await handRung(db, game.id));
  if (head !== undefined) {
    return { row: head.row, arm: head.pos.hand ? "hand" : "turn", seq: head.pos.seq };
  }
  const row = await latestSnapshot(db, game.id);
  // NO_SEQ, not the row's own position: the fallback walk is game-wide and deliberately position-blind (it
  // answers "any state at all" when the ladder is empty), so claiming a rung for it would be a fiction.
  return row === undefined ? undefined : { row, arm: "fallback", seq: NO_SEQ };
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
 *  Rung 1 is the seq-bounded lineage walk, BOTH arms (D124): the last visible assistant SELECTED variant
 *  strictly before this slot, unioned with the newest HAND row whose as-of slot is strictly below it — the
 *  same rows the pre-D124 walk found as anchor slots below the slot. So rerolling a MID-chat message bases on
 *  its predecessor (including a host hand-edit made back there), never on a downstream beat. The game-wide
 *  fallbacks (committed → any) still exclude this slot's own rows. */
export async function resolveSnapshotBeforeSlot(db: Db, game: SnapshotGameRef, messageId: MessageId): Promise<RpgSnapshotRow | undefined> {
  const seq = await findMessageSeq(db, messageId);
  if (seq !== undefined) {
    const prev = laterRung(await turnRung(db, game.chatId, seq), await handRung(db, game.id, { seq, tie: null }));
    if (prev !== undefined) {
      return prev.row;
    }
  }
  return latestSnapshot(db, game.id, messageId);
}

/** The turn's prev→current snapshot PAIR on the selected lineage (parity-plus §2.7 — the delta block's input).
 *  `cur` is the state this turn reads (the head — or, on a REGEN, the state as of before the regenerated slot;
 *  see `beforeMessageId`), the same snapshot the tracker view projects from; `prev` is the snapshot ONE rung
 *  back on the SAME lineage — the ladder row immediately before `cur` (D124: the later of the bounded turn arm
 *  and the bounded hand arm, which reproduces the pre-D124 walk exactly, since an anchor slot WAS a rung).
 *  Both ends re-resolve on the currently-selected chain, so a swipe re-selects prev+current together — the
 *  delta is swipe-consistent for FREE (§2.7). `prev` is `undefined` when `cur` is the FIRST snapshot on the
 *  lineage (no prior beat — the delta renders the first-state form or omits) OR when `cur` is undefined (a
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
  const pos = await ladderPosOf(db, cur);
  if (pos === undefined) {
    return { cur, prev: undefined }; // cur's own slot vanished (a racing delete) — no lineage to walk
  }
  const bounds = boundsBefore(pos);
  const prev = laterRung(await turnRung(db, game.chatId, bounds.turnBelow), await handRung(db, game.id, bounds.hand));
  return { cur, prev: prev?.row };
}

/** Insert a snapshot row (a turn flush's forwarded row, or a hand row), returning it parsed. The JSON values
 *  arrive already-typed (from a parsed base or a validated config), so the read-side parse on the returned row
 *  is the corruption belt. */
export async function insertSnapshot(db: Db, values: NewRpgSnapshot): Promise<RpgSnapshotRow> {
  const rows = await db.insert(rpgSnapshots).values(values).returning();
  const row = rows[0];
  if (!row) {
    throw new Error("insertSnapshot: no row returned");
  }
  return parseSnapshotRow(row);
}

/** The row-IDENTITY half of an insert — the D124 two-arm discriminant, spelled in exactly these two helpers
 *  so no writer can hand-assemble a third (illegal) combination past the CHECK. */
type SnapshotArmKeys = Pick<NewRpgSnapshot, "messageId" | "variantId" | "asOfMessageId">;

function turnArmKeys(target: TurnSnapshotTarget): SnapshotArmKeys {
  return { messageId: target.messageId, variantId: target.variantId, asOfMessageId: null };
}

function handArmKeys(asOfMessageId: MessageId | null): SnapshotArmKeys {
  return { messageId: null, variantId: null, asOfMessageId };
}

/** The chat's TAIL slot — a hand row's as-of order stamp. `null` on a turnless chat (the row then orders
 *  before all history, {@link NO_SEQ}). Resolved INSIDE the write so no caller can stamp a stale tail. */
async function findTailMessageId(db: Db, chatId: ChatId): Promise<MessageId | null> {
  const rows = await db.select({ id: messages.id }).from(messages).where(eq(messages.chatId, chatId)).orderBy(desc(messages.seq)).limit(LIMIT_ONE);
  return rows[0]?.id ?? null;
}

/** Compose a snapshot INSERT from an effective state + its arm keys (the shared body of every writer).
 *  `committed` + `fieldLocks` differ per writer (a turn flush is born 0 and carries locks forward from the
 *  base; a hand row is born 1 — both from the base's locks, since tools never author locks). */
function snapshotInsertFrom(
  state: RpgSnapshotState,
  row: { readonly fieldLocks: RpgSnapshotState["fieldLocks"]; readonly committed: number; readonly arm: SnapshotArmKeys },
  base: { readonly id: RpgSnapshotId; readonly gameId: RpgGameId; readonly now: number },
): NewRpgSnapshot {
  return {
    id: base.id,
    gameId: base.gameId,
    ...row.arm,
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
    fieldLocks: row.fieldLocks,
    committed: row.committed,
    createdAt: base.now,
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
 *  mirroring the extraction's non-conforming empty-delta path), never commits a poisoned row, AND LOGS the
 *  reason (the drop is observable, never silent). */
export async function writeStagedSnapshot(db: Db, state: RpgSnapshotState, target: TurnSnapshotTarget): Promise<WriteStagedSnapshotResult> {
  const parsed = rpgSnapshotStateSchema.safeParse(state);
  if (!parsed.success) {
    // The full field-path + reason (e.g. `actorState.0.pools.0.max: expected >= 1`) — the drop's WHY.
    return { ok: false, reason: parsed.error.message };
  }
  const row = await insertSnapshot(db, snapshotInsertFrom(state, { fieldLocks: state.fieldLocks, committed: UNCOMMITTED, arm: turnArmKeys(target) }, target));
  return { ok: true, row };
}

/** THE HAND-ARM WRITE (D124) — the ONE home for every message-less snapshot: the 7 hand doors' clone-forward,
 *  the host resync, populate-from-card, and checkpoint restore. Born COMMITTED (a hand write is the truth
 *  immediately, never a swipe-volatile draft), stamped with the chat's tail slot as its as-of position.
 *  NOTHING is posted to the message plane — that is the whole point of the arm. */
export async function writeHandSnapshot(
  db: Db,
  state: RpgSnapshotState,
  fieldLocks: RpgSnapshotState["fieldLocks"],
  target: HandSnapshotTarget,
): Promise<RpgSnapshotRow> {
  const asOfMessageId = await findTailMessageId(db, target.chatId);
  return insertSnapshot(db, snapshotInsertFrom(state, { fieldLocks, committed: COMMITTED, arm: handArmKeys(asOfMessageId) }, target));
}

/** The host RESYNC / POPULATE write (crunchy-cluster §1.3): the reconciled effective state as a HAND row,
 *  BORN COMMITTED (the host deliberately re-derived the panel; it is the truth immediately). The state
 *  arrives locks-honored (the verb applied `applyLockedPatch` — a resync never clobbers a hand-pin);
 *  `fieldLocks` carry forward on the state.
 *
 *  Rides the SAME F1 write-boundary backstop as `writeStagedSnapshot`: validate the state against the full
 *  contract schema BEFORE the durable insert, so a resync can never poison a row (errors-as-data — the verb
 *  drops on `{ok:false}`). */
export async function writeResyncedSnapshot(db: Db, state: RpgSnapshotState, target: HandSnapshotTarget): Promise<WriteStagedSnapshotResult> {
  const parsed = rpgSnapshotStateSchema.safeParse(state);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.message };
  }
  const row = await writeHandSnapshot(db, state, state.fieldLocks, target);
  return { ok: true, row };
}

/** Checkpoint restore: clone a pointed snapshot forward as a HAND row, BORN COMMITTED (locks preserved). Per
 *  D124 fork 4 the restore's own snapshot is a hand row too — the visible "— scene restored —" notice stays
 *  pure prose, and swiping that notice can never orphan the restored state. */
export function writeRestoredSnapshot(db: Db, base: RpgSnapshotRow, target: HandSnapshotTarget): Promise<RpgSnapshotRow> {
  return writeHandSnapshot(db, snapshotRowToState(base), base.fieldLocks, target);
}

/** Lock in the state the user was seeing: set `committed=1` on one variant's snapshot (`onUserCommit`). */
export async function commitSnapshotForVariant(db: Db, variantId: MessageVariantId): Promise<void> {
  await db.update(rpgSnapshots).set({ committed: COMMITTED }).where(eq(rpgSnapshots.variantId, variantId));
}

/** The seq of the chat's LAST VISIBLE ASSISTANT SLOT, or `undefined` on a chat with none — "which beat is the
 *  story currently on". The flush's fold asks it to tell its two shapes apart: a flush whose slot IS that beat
 *  was raced by a concurrent writer (reconcile, or say so out loud), while a flush for an EARLIER slot is a
 *  REGEN of an old message whose row is legitimately superseded by the beats after it — folding that turn's
 *  writes into the current head would inject an old beat's consequences into the present, and shouting about it
 *  would be noise about the normal case. Same visibility predicate as {@link turnRung}'s slot walk, minus the
 *  snapshot join (the fold's question is about the STORY's position, not about whether a row exists there). */
export async function findLatestAssistantSlotSeq(db: Db, chatId: ChatId): Promise<number | undefined> {
  const rows = await db
    .select({ seq: messages.seq })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "assistant"), eq(messages.excludedFromPrompt, false)))
    .orderBy(desc(messages.seq))
    .limit(LIMIT_ONE);
  return rows[0]?.seq;
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
