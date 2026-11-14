// Canon leaving owners' stats scope: a deleted room, or the started rooms a deleted character was its owner's last seat
// in. The rebuild is the truth for counts and activity, so the live rollups lose exactly the contribution the rebuild's
// own fold gives that canon, and the extrema are re-derived from what is left. Paid spend never lowers: it stays on the
// owner, timeline and model rollups and moves into the owner-stamped spend ledger as `retired-canon` rows, one per paid
// sample, which the rebuild folds in place of the canon. The character grain loses the room's spend with its counts:
// the ledger is the owner's money (D23), not a character's.
// The plan is read before the delete's batch; the batch opens with a guard that rolls everything back when a live write
// moved an affected owner's canon in between, and the caller prepares again.

import type { CanonRetirement, CanonRetirementScope, PrepareCanonRetirement, RetiredSpend } from "@orb/contracts/stats";
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
import type { Accums, BucketAccum, CharAccum, ModelAccum, OwnerAccum } from "../contract/rebuild-from-canon.ts";
import { RETAINED_CHAT_OWNERS_ALIAS } from "../contract/retained-chat-accounting.ts";
import { createOwnerAccums, foldCanonMessage, foldCanonSwipe, retiredSpendOf } from "../substrate/rebuild-rollups.ts";
import { bumpStatsCanonVersion } from "../write/apply-delta.ts";
import { retireCharacterCensus, shiftCharacterCensus } from "../write/character-census.ts";
import { retainedCharacterSeatPredicate, retainedChatOwners } from "./owner-chat-scope.ts";
import type { CanonSnapshot } from "./rebuild-from-canon.ts";
import { canonUnchangedStatement, ownerCanonSnapshot, scanMessages, scanSwipes } from "./rebuild-from-canon.ts";
import { settleRetainedChatRebase } from "./retained-chat-accounting.ts";

const CHARACTER_ID = typeIdSchema(ID_PREFIX.character);

type Additive<T> = { [K in keyof T]-?: T[K] extends number ? K : never }[keyof T];
// Spend the retirement keeps on the live rollups, because the ledger rows carry it; every other additive column leaves.
type Disposition = "retire" | "keep";

// Last activity is an extremum: the settle after the delete re-derives it, so it has no disposition here.
const OWNER_GRAIN: Readonly<Record<Exclude<Additive<OwnerAccum>, "lastActivityAt">, Disposition>> = {
  userTurns: "retire",
  assistantTurns: "retire",
  systemTurns: "retire",
  swipes: "retire",
  userWords: "retire",
  assistantWords: "retire",
  swipeWords: "retire",
  tokensIn: "retire",
  tokensOut: "retire",
  tokensInMeasuredSamples: "retire",
  tokensInEstimatedSamples: "retire",
  tokensOutMeasuredSamples: "retire",
  tokensOutEstimatedSamples: "retire",
  genTimeMs: "retire",
  genSamples: "retire",
  reasoningGenerations: "retire",
  reasoningMs: "retire",
  costUsd: "keep",
  costSamples: "keep",
  notionalCostSamples: "keep",
  activeIdxSum: "retire",
  variantMessages: "retire",
  contentChars: "retire",
  cacheReadTokens: "retire",
  cacheWriteTokens: "retire",
};

const BUCKET_GRAIN: Readonly<Record<Additive<BucketAccum>, Disposition>> = {
  userTurns: "retire",
  assistantTurns: "retire",
  systemTurns: "retire",
  swipes: "retire",
  userWords: "retire",
  assistantWords: "retire",
  tokensIn: "retire",
  tokensOut: "retire",
  tokensInMeasuredSamples: "retire",
  tokensInEstimatedSamples: "retire",
  tokensOutMeasuredSamples: "retire",
  tokensOutEstimatedSamples: "retire",
  genTimeMs: "retire",
  costUsd: "keep",
  costSamples: "keep",
  notionalCostSamples: "keep",
};

const MODEL_GRAIN: Readonly<Record<Additive<ModelAccum>, Disposition>> = {
  generations: "retire",
  tokensIn: "retire",
  tokensOut: "retire",
  tokensInMeasuredSamples: "retire",
  tokensInEstimatedSamples: "retire",
  tokensOutMeasuredSamples: "retire",
  tokensOutEstimatedSamples: "retire",
  genTimeMs: "retire",
  genSamples: "retire",
  reasoningGenerations: "retire",
  reasoningMs: "retire",
  costUsd: "keep",
  costSamples: "keep",
  notionalCostSamples: "keep",
  cacheReadTokens: "retire",
  cacheWriteTokens: "retire",
};

// The character's last message is its last activity, re-derived by the settle like the owner's.
const CHARACTER_GRAIN: Readonly<Record<Exclude<Additive<CharAccum>, "lastMsgAt">, Disposition>> = {
  userTurns: "retire",
  assistantTurns: "retire",
  systemTurns: "retire",
  swipes: "retire",
  userWords: "retire",
  assistantWords: "retire",
  swipeWords: "retire",
  tokensIn: "retire",
  tokensOut: "retire",
  tokensInMeasuredSamples: "retire",
  tokensInEstimatedSamples: "retire",
  tokensOutMeasuredSamples: "retire",
  tokensOutEstimatedSamples: "retire",
  genTimeMs: "retire",
  genSamples: "retire",
  reasoningGenerations: "retire",
  reasoningMs: "retire",
  costUsd: "retire",
  costSamples: "retire",
  notionalCostSamples: "retire",
  activeIdxSum: "retire",
  variantMessages: "retire",
  contentChars: "retire",
};

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

// The rebuild writes a timeline or model row only for a grain something still lands on, so a row the retirement left
// all zero is deleted with it rather than shown as an empty bucket the rebuild would not have.
function emptied<K extends string>(columns: { readonly [P in K]: SQLiteColumn }, keys: readonly K[]): SQL[] {
  return keys.map((key) => eq(columns[key], 0));
}

const BUCKET_COLUMNS = [...(Object.keys(BUCKET_GRAIN) as (keyof typeof BUCKET_GRAIN)[]), "chatsCreated"] as const;
const MODEL_COLUMNS = Object.keys(MODEL_GRAIN) as (keyof typeof MODEL_GRAIN)[];

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
    const row = and(eq(dailyStats.ownerId, ownerId), eq(dailyStats.bucketStart, bucketStart));
    batch.push(
      db
        .update(dailyStats)
        .set({
          ...(bucket === undefined ? {} : retiredSet(dailyStats, bucket, BUCKET_GRAIN)),
          chatsCreated: sql`${dailyStats.chatsCreated} - ${created.get(bucketStart)?.length ?? 0}`,
        })
        .where(row),
      db.delete(dailyStats).where(and(row, ...emptied(dailyStats, BUCKET_COLUMNS))),
    );
  }
  for (const entry of accums.modelMap.values()) {
    const set = retiredSet(modelStats, entry.acc, MODEL_GRAIN);
    if (Object.keys(set).length > 0) {
      const row = and(eq(modelStats.ownerId, ownerId), eq(modelStats.model, entry.model), eq(modelStats.provider, entry.provider ?? MODEL_PROVIDER_UNKNOWN));
      batch.push(db.update(modelStats).set(set).where(row), db.delete(modelStats).where(and(row, ...emptied(modelStats, MODEL_COLUMNS))));
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
function appendCensus(batch: BatchStmt[], db: Db, scope: CanonRetirementScope, plan: OwnerRetirement): void {
  if (scope.kind === "character") {
    retireCharacterCensus(batch, db, { ownerId: plan.ownerId, characterId: scope.characterId });
    return;
  }
  for (const characterId of plan.seats.keys()) {
    shiftCharacterCensus(batch, db, { ownerId: plan.ownerId, characterId, chatId: scope.chatId, direction: -1 });
  }
}

const snapshotMoved = (before: CanonSnapshot, now: CanonSnapshot): boolean =>
  now.canonVersion !== before.canonVersion || now.characterCount !== before.characterCount;

async function planOwner(db: Db, ownerId: UserId, rooms: readonly ChatId[]): Promise<OwnerRetirement> {
  if (rooms.length > 0) {
    return foldOwnerRetirement(db, ownerId, rooms);
  }
  // A deleted character with no last seat still moves the census, so its owner's canon is fenced like any other.
  return {
    ownerId,
    snapshot: await ownerCanonSnapshot(db, ownerId),
    accums: createOwnerAccums(),
    kept: [],
    rooms: [],
    seats: new Map<CharacterId, never>(),
    characters: [],
  };
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
    const plans: OwnerRetirement[] = [];
    for (const share of await leavingShares(db, scope)) {
      plans.push(await planOwner(db, share.ownerId, share.rooms));
    }
    return {
      beforeDelete: (batch, batchDb): void => {
        batch.push(...plans.map((plan) => canonUnchangedStatement(batchDb, plan.ownerId, plan.snapshot)));
        for (const plan of plans) {
          appendRetirement(batch, batchDb, plan, idSource);
          appendCensus(batch, batchDb, scope, plan);
        }
      },
      afterDelete: (batch, batchDb): void => {
        const deleted = scope.kind === "character" ? scope.characterId : null;
        const characterIds = plans.flatMap((plan) => plan.characters.filter((id) => id !== deleted));
        settleRetainedChatRebase(batch, batchDb, { ownerIds: plans.map((plan) => plan.ownerId), characterIds });
      },
      refused: async (error): Promise<boolean> => {
        if (isConstraintViolation(error)?.kind !== "not-null") {
          return false;
        }
        for (const plan of plans) {
          if (snapshotMoved(plan.snapshot, await ownerCanonSnapshot(db, plan.ownerId))) {
            return true;
          }
        }
        return false;
      },
    };
  };
}
