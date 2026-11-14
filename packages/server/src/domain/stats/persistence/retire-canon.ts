// Canon leaving owners' stats scope: a deleted room, or the started rooms a deleted character was its owner's last seat
// in. The rebuild is the truth for counts and activity, so the live rollups lose exactly the contribution the rebuild's
// own fold gives that canon, and the settle after the delete re-derives the extrema and drops a timeline or model row left
// all zero. Paid spend never lowers: it stays on the
// owner, timeline and model rollups and moves into the owner-stamped spend ledger as `retired-canon` rows, one per paid
// sample, which the rebuild folds in place of the canon. The character grain loses the room's spend with its counts:
// the ledger is the owner's money (D23), not a character's.
// The plan is read before the delete's batch; the batch opens with a guard that rolls everything back when a live write
// moved an affected owner's canon in between, and the caller prepares again.

import type { CanonAdmission, CanonRetirement, CanonRetirementScope, PrepareCanonAdmission, PrepareCanonRetirement, RetiredSpend } from "@orb/contracts/stats";
import { RETIRED_CANON_KIND } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { characterStats, dailyStats, modelStats, ownerStats, spendLedger } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { isConstraintViolation } from "@orb/db/query";
import type { CharacterId, ChatId, IdSource, UserId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { MODEL_PROVIDER_UNKNOWN, statsBucketStart } from "@orb/kit/stats-tally";
import type { SQL } from "drizzle-orm";
import { and, eq, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Accums } from "../contract/rebuild-from-canon.ts";
import { RETAINED_CHAT_OWNERS_ALIAS } from "../contract/retained-chat-accounting.ts";
import { createOwnerAccums, foldCanonMessage, foldCanonSwipe, retiredSpendOf } from "../substrate/rebuild-rollups.ts";
import { bumpStatsCanonVersion } from "../write/apply-delta.ts";
import { retireCharacterCensus, shiftCharacterCensus } from "../write/character-census.ts";
import { retainedCharacterSeatPredicate, retainedChatOwners } from "./owner-chat-scope.ts";
import type { CanonSnapshot } from "./rebuild-from-canon.ts";
import { canonUnchangedStatement, ownerCanonSnapshot, scanMessages, scanSwipes } from "./rebuild-from-canon.ts";
import { settleRetainedChatRebase } from "./retained-chat-accounting.ts";
import type { Disposition } from "./rollup-grains.ts";
import { BUCKET_GRAIN, CHARACTER_GRAIN, MODEL_GRAIN, OWNER_GRAIN } from "./rollup-grains.ts";

const CHARACTER_ID = typeIdSchema(ID_PREFIX.character);

/** `column = column - value` for every retired column of one grain. */
function retiredSet<K extends string>(
  columns: { readonly [P in K]: SQLiteColumn },
  acc: { readonly [P in K]: number },
  grain: Readonly<Record<K, Disposition>>,
): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const key of Object.keys(grain) as K[]) {
    if (grain[key] === "retire" && acc[key] !== 0) {
      set[key] = sql`${columns[key]} - ${acc[key]}`;
    }
  }
  return set;
}

/** One owner's share of the leaving canon: its fold, the paid samples it keeps, and the rooms' library counts. */
interface OwnerRetirement {
  readonly ownerId: UserId;
  readonly snapshot: CanonSnapshot;
  readonly accums: Accums;
  readonly kept: readonly RetiredSpend[];
  readonly rooms: readonly { readonly id: ChatId; readonly createdAt: number; readonly forked: boolean }[];
  // Each owned character's seats in the leaving rooms, and whether each room is a fork.
  readonly seats: ReadonlyMap<CharacterId, readonly { readonly chatId: ChatId; readonly forked: boolean }[]>;
  // Owned characters with canon or a seat in the leaving rooms: their character rows lose that contribution.
  readonly characters: readonly CharacterId[];
}

const roomList = (rooms: readonly ChatId[]): SQL =>
  sql.join(
    rooms.map((id) => sql`${id}`),
    sql`, `,
  );

/** The started rooms the owner counts that lose their last owned seat with `characterId`. */
async function roomsLosingLastSeat(db: Db, ownerId: UserId, characterId: CharacterId): Promise<ChatId[]> {
  const rows = await db.all<{ chatId: ChatId }>(sql`
    SELECT DISTINCT cp.chat_id AS chatId FROM chat_participants cp JOIN chats ch ON ch.id = cp.chat_id JOIN characters c ON c.id = cp.character_id
    WHERE cp.character_id = ${characterId} AND ${retainedCharacterSeatPredicate(sql`${ownerId}`)}
      AND NOT EXISTS (SELECT 1 FROM chat_participants o JOIN characters oc ON oc.id = o.character_id
        WHERE o.chat_id = cp.chat_id AND o.kind = 'character' AND oc.owner_id = ${ownerId} AND o.character_id != ${characterId})
    ORDER BY cp.chat_id`);
  return rows.map((row) => row.chatId);
}

async function foldOwnerRetirement(db: Db, ownerId: UserId, rooms: readonly ChatId[]): Promise<OwnerRetirement> {
  const snapshot = await ownerCanonSnapshot(db, ownerId);
  const accums = createOwnerAccums();
  const kept: RetiredSpend[] = [];
  const list = roomList(rooms);
  await scanMessages(db, list, (row) => {
    foldCanonMessage(ownerId, row, accums);
    kept.push(...retiredSpendOf(ownerId, row));
  });
  await scanSwipes(db, list, (row) => foldCanonSwipe(ownerId, row, accums));
  const roomRows = await db.all<{ id: ChatId; createdAt: number; forked: number }>(sql`
    SELECT id, created_at AS createdAt, parent_chat_id IS NOT NULL AS forked FROM chats WHERE id IN (${list}) ORDER BY id`);
  const seatRows = await db.all<{ cid: CharacterId; chatId: ChatId; forked: number }>(sql`
    SELECT DISTINCT cp.character_id AS cid, cp.chat_id AS chatId, ch.parent_chat_id IS NOT NULL AS forked
    FROM chat_participants cp JOIN chats ch ON ch.id = cp.chat_id JOIN characters c ON c.id = cp.character_id
    WHERE cp.chat_id IN (${list}) AND ${retainedCharacterSeatPredicate(sql`${ownerId}`)} ORDER BY cp.character_id, cp.chat_id`);
  const seats = Map.groupBy(
    seatRows.map((row) => ({ ...row, forked: row.forked === 1 })),
    (row) => row.cid,
  );
  const authored = [...accums.charMap.keys()].map((id) => CHARACTER_ID.parse(id));
  const owned = await db.all<{ id: CharacterId }>(sql`
    SELECT id FROM characters WHERE owner_id = ${ownerId} AND id IN (${sql.join(
      [...new Set([...authored, ...seats.keys()])].map((id) => sql`${id}`),
      sql`, `,
    )}) ORDER BY id`);
  return {
    ownerId,
    snapshot,
    accums,
    kept,
    rooms: roomRows.map((row) => ({ id: row.id, createdAt: row.createdAt, forked: row.forked === 1 })),
    seats,
    characters: owned.map((row) => row.id),
  };
}

function appendRetirement(batch: BatchStmt[], db: Db, plan: OwnerRetirement, idSource: IdSource): void {
  const { ownerId, accums } = plan;
  const forks = plan.rooms.filter((room) => room.forked).length;
  batch.push(
    db
      .update(ownerStats)
      .set({
        ...retiredSet(ownerStats, accums.owner, OWNER_GRAIN),
        chats: sql`${ownerStats.chats} - ${plan.rooms.length}`,
        forkedChats: sql`${ownerStats.forkedChats} - ${forks}`,
      })
      .where(eq(ownerStats.ownerId, ownerId)),
  );
  const created = Map.groupBy(plan.rooms, (room) => statsBucketStart(room.createdAt));
  for (const bucketStart of new Set([...accums.bucketMap.keys(), ...created.keys()])) {
    const bucket = accums.bucketMap.get(bucketStart);
    batch.push(
      db
        .update(dailyStats)
        .set({
          ...(bucket === undefined ? {} : retiredSet(dailyStats, bucket, BUCKET_GRAIN)),
          chatsCreated: sql`${dailyStats.chatsCreated} - ${created.get(bucketStart)?.length ?? 0}`,
        })
        .where(and(eq(dailyStats.ownerId, ownerId), eq(dailyStats.bucketStart, bucketStart))),
    );
  }
  for (const entry of accums.modelMap.values()) {
    const set = retiredSet(modelStats, entry.acc, MODEL_GRAIN);
    if (Object.keys(set).length > 0) {
      batch.push(
        db
          .update(modelStats)
          .set(set)
          .where(and(eq(modelStats.ownerId, ownerId), eq(modelStats.model, entry.model), eq(modelStats.provider, entry.provider ?? MODEL_PROVIDER_UNKNOWN))),
      );
    }
  }
  for (const characterId of plan.characters) {
    const acc = accums.charMap.get(characterId);
    const seats = plan.seats.get(characterId) ?? [];
    batch.push(
      db
        .update(characterStats)
        .set({
          ...(acc === undefined ? {} : retiredSet(characterStats, acc, CHARACTER_GRAIN)),
          chats: sql`${characterStats.chats} - ${seats.length}`,
          forkedChats: sql`${characterStats.forkedChats} - ${seats.filter((seat) => seat.forked).length}`,
        })
        .where(eq(characterStats.characterId, characterId)),
    );
  }
  for (const spend of plan.kept) {
    batch.push(
      db.insert(spendLedger).values({
        id: idSource.typeId(ID_PREFIX.spendLedger),
        ownerId,
        kind: RETIRED_CANON_KIND,
        costUsd: spend.costUsd,
        createdAt: spend.now,
        model: spend.model,
        provider: spend.model === null ? null : spend.provider,
        notional: spend.notional,
      }),
    );
  }
  bumpStatsCanonVersion(batch, db, ownerId);
}

// Before the delete: the census guards read the seats the delete's cascade removes.
function appendCensus(
  batch: BatchStmt[],
  db: Db,
  scope: CanonRetirementScope,
  { ownerId, plan }: { readonly ownerId: UserId; readonly plan: OwnerRetirement | undefined },
): void {
  if (scope.kind === "character") {
    retireCharacterCensus(batch, db, { ownerId, characterId: scope.characterId });
    return;
  }
  for (const characterId of plan?.seats.keys() ?? []) {
    shiftCharacterCensus(batch, db, { ownerId, characterId, chatId: scope.chatId, direction: -1 });
  }
}

const snapshotMoved = (before: CanonSnapshot, now: CanonSnapshot): boolean =>
  now.canonVersion !== before.canonVersion || now.characterCount !== before.characterCount;

async function anyMoved(db: Db, plans: readonly OwnerRetirement[], error: unknown): Promise<boolean> {
  if (plans.length === 0 || isConstraintViolation(error)?.kind !== "not-null") {
    return false;
  }
  for (const plan of plans) {
    if (snapshotMoved(plan.snapshot, await ownerCanonSnapshot(db, plan.ownerId))) {
      return true;
    }
  }
  return false;
}

async function leavingShares(db: Db, scope: CanonRetirementScope): Promise<{ ownerId: UserId; rooms: readonly ChatId[] }[]> {
  if (scope.kind === "character") {
    return [{ ownerId: scope.ownerId, rooms: await roomsLosingLastSeat(db, scope.ownerId, scope.characterId) }];
  }
  const owners = await db
    .select()
    .from(retainedChatOwners(scope.chatId).as(RETAINED_CHAT_OWNERS_ALIAS))
    .orderBy(({ ownerId }) => ownerId);
  return owners.map((row) => ({ ownerId: row.ownerId, rooms: [scope.chatId] }));
}

/** Stats-built: the caller has already authorized the delete this plan surrounds. */
export function createPrepareCanonRetirement(idSource: IdSource): PrepareCanonRetirement<BatchStmt[], Db> {
  return async (db: Db, scope: CanonRetirementScope): Promise<CanonRetirement<BatchStmt[], Db>> => {
    const shares = await leavingShares(db, scope);
    // A share with no leaving room moves only the census, which decides inside its own statement, so it reads no
    // canon and pays no guard: a bulk delete of unseated cards never contends with itself.
    const plans: OwnerRetirement[] = [];
    for (const share of shares.filter(({ rooms }) => rooms.length > 0)) {
      plans.push(await foldOwnerRetirement(db, share.ownerId, share.rooms));
    }
    const planOf = new Map(plans.map((plan) => [plan.ownerId, plan]));
    return {
      beforeDelete: (batch, batchDb): void => {
        batch.push(...plans.map((plan) => canonUnchangedStatement(batchDb, plan.ownerId, plan.snapshot)));
        for (const plan of plans) {
          appendRetirement(batch, batchDb, plan, idSource);
        }
        for (const { ownerId } of shares) {
          appendCensus(batch, batchDb, scope, { ownerId, plan: planOf.get(ownerId) });
        }
      },
      afterDelete: (batch, batchDb): void => {
        if (plans.length === 0) {
          return;
        }
        const deleted = scope.kind === "character" ? scope.characterId : null;
        const characterIds = plans.flatMap((plan) => plan.characters.filter((id) => id !== deleted));
        settleRetainedChatRebase(batch, batchDb, { ownerIds: plans.map((plan) => plan.ownerId), characterIds });
      },
      refused: (error): Promise<boolean> => anyMoved(db, plans, error),
    };
  };
}

/** `column = column + value` for every column a retirement takes away. */
function admittedSet<K extends string>(
  columns: { readonly [P in K]: SQLiteColumn },
  acc: { readonly [P in K]: number },
  grain: Readonly<Record<K, Disposition>>,
): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const key of Object.keys(grain) as K[]) {
    if (grain[key] === "retire" && acc[key] !== 0) {
      set[key] = sql`${columns[key]} + ${acc[key]}`;
    }
  }
  return set;
}

/** The plain values a fresh timeline or model row starts from, for the grain's taken-away columns. */
function admittedValues<K extends string>(acc: { readonly [P in K]: number }, grain: Readonly<Record<K, Disposition>>): Partial<Record<K, number>> {
  const values: Partial<Record<K, number>> = {};
  for (const key of Object.keys(grain) as K[]) {
    if (grain[key] === "retire") {
      values[key] = acc[key];
    }
  }
  return values;
}

// The inverse of `appendRetirement` for one room coming back into scope. Spend is not added: the retirement kept it
// on the live rollups, and one retired ledger row per paid sample leaves instead, so canon carries it again. A room no
// owned seat holds voices no living owned character (a deleted voice reads as none), so the character grain is
// untouched; the new seat's own delta counts its character. The timeline and model rows a retirement emptied were
// deleted, so they are upserted here.
function appendAdmission(batch: BatchStmt[], db: Db, plan: OwnerRetirement, idSource: IdSource): void {
  const { ownerId, accums } = plan;
  const forks = plan.rooms.filter((room) => room.forked).length;
  batch.push(
    db
      .update(ownerStats)
      .set({
        ...admittedSet(ownerStats, accums.owner, OWNER_GRAIN),
        chats: sql`${ownerStats.chats} + ${plan.rooms.length}`,
        forkedChats: sql`${ownerStats.forkedChats} + ${forks}`,
      })
      .where(eq(ownerStats.ownerId, ownerId)),
  );
  const created = Map.groupBy(plan.rooms, (room) => statsBucketStart(room.createdAt));
  for (const bucketStart of new Set([...accums.bucketMap.keys(), ...created.keys()])) {
    const bucket = accums.bucketMap.get(bucketStart);
    const chatsCreated = created.get(bucketStart)?.length ?? 0;
    batch.push(
      db
        .insert(dailyStats)
        .values({
          id: idSource.typeId(ID_PREFIX.dailyStat),
          ownerId,
          bucketStart,
          ...(bucket === undefined ? {} : admittedValues(bucket, BUCKET_GRAIN)),
          chatsCreated,
        })
        .onConflictDoUpdate({
          target: [dailyStats.ownerId, dailyStats.bucketStart],
          set: {
            ...(bucket === undefined ? {} : admittedSet(dailyStats, bucket, BUCKET_GRAIN)),
            chatsCreated: sql`${dailyStats.chatsCreated} + ${chatsCreated}`,
          },
        }),
    );
  }
  for (const entry of accums.modelMap.values()) {
    const set = admittedSet(modelStats, entry.acc, MODEL_GRAIN);
    if (Object.keys(set).length > 0) {
      batch.push(
        db
          .insert(modelStats)
          .values({
            id: idSource.typeId(ID_PREFIX.modelStat),
            ownerId,
            model: entry.model,
            provider: entry.provider ?? MODEL_PROVIDER_UNKNOWN,
            ...admittedValues(entry.acc, MODEL_GRAIN),
          })
          .onConflictDoUpdate({ target: [modelStats.ownerId, modelStats.model, modelStats.provider], set }),
      );
    }
  }
  // Retired rows are facts with no identity of their own: two with equal facts are interchangeable for every figure,
  // so each paid sample takes away any one row that states it.
  for (const spend of plan.kept) {
    const provider = spend.model === null ? null : spend.provider;
    batch.push(
      db
        .delete(spendLedger)
        .where(
          eq(
            spendLedger.id,
            sql`(SELECT ${spendLedger.id} FROM ${spendLedger} WHERE ${and(
              eq(spendLedger.ownerId, ownerId),
              eq(spendLedger.kind, RETIRED_CANON_KIND),
              eq(spendLedger.costUsd, spend.costUsd),
              eq(spendLedger.createdAt, spend.now),
              sql`${spendLedger.model} IS ${spend.model}`,
              sql`${spendLedger.provider} IS ${provider}`,
              eq(spendLedger.notional, spend.notional),
            )} ORDER BY ${spendLedger.id} LIMIT 1)`,
          ),
        ),
    );
  }
  bumpStatsCanonVersion(batch, db, ownerId);
}

const NO_ADMISSION: CanonAdmission<BatchStmt[], Db> = {
  beforeSeat: () => undefined,
  afterSeat: () => undefined,
  refused: () => Promise.resolve(false),
};

/** Stats-built: the caller has already authorized the seat this plan surrounds. */
export function createPrepareCanonAdmission(idSource: IdSource): PrepareCanonAdmission<BatchStmt[], Db> {
  return async (db: Db, { ownerId, chatId }): Promise<CanonAdmission<BatchStmt[], Db>> => {
    const [outOfScope] = await db.all<{ id: ChatId }>(sql`
      SELECT ch.id AS id FROM chats ch WHERE ch.id = ${chatId} AND ch.started_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM chat_participants cp JOIN characters c ON c.id = cp.character_id
          WHERE cp.chat_id = ch.id AND cp.kind = 'character' AND c.owner_id = ${ownerId})`);
    if (outOfScope === undefined) {
      return NO_ADMISSION;
    }
    const plan = await foldOwnerRetirement(db, ownerId, [chatId]);
    return {
      beforeSeat: (batch, batchDb): void => {
        batch.push(canonUnchangedStatement(batchDb, ownerId, plan.snapshot));
        appendAdmission(batch, batchDb, plan, idSource);
      },
      afterSeat: (batch, batchDb): void => settleRetainedChatRebase(batch, batchDb, { ownerIds: [ownerId], characterIds: [] }),
      refused: (error): Promise<boolean> => anyMoved(db, [plan], error),
    };
  };
}
