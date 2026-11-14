// Full RECONCILE: a memory-bounded streaming rebuild of the four rollup tables for one owner (or every
// owner) from canon — the backfill/post-import/drift-repair path (rollups are maintained live elsewhere).
// Canon includes the message stream, retained generation observations, embedding calls, imagery provenance and the
// spend ledger. Last activity comes from messages and spend alone; a write to a room's row is not activity.
// Keyset-paged streams over messages + swipe variants (bounded peak memory); per-character/model/bucket
// accumulator Maps; atomic per-owner replace-write (one db.batch) so a read never sees a half-rebuilt owner.
// Owner-scoping follows the same retained host/character cohort predicates as the live accounting writers.

import { userIdSchema } from "@orb/contracts/identity";
import type { ProviderId } from "@orb/contracts/inference";
import { modelIdSchema, responseCacheSchema, storedGenerationUsageLegSchema } from "@orb/contracts/inference";
import type { ReconcileStatsResult, SpendDelta, SpendLedgerKind } from "@orb/contracts/stats";
import {
  embeddingSpendDelta,
  generationObservationSpendDelta,
  imageGenerationSpendDelta,
  ledgerSpendDelta,
  retiredCanonSpendDelta,
  STATS_REBUILD_ATTEMPTS,
} from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import {
  assets,
  characterStats,
  characters,
  chatGenerationObservations,
  dailyStats,
  embeddingCalls,
  imageryGenerations,
  modelStats,
  ownerStats,
  spendLedger,
  statsCanonVersions,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchMany, chunkRows, isConstraintViolation } from "@orb/db/query";
import { DomainUnavailableError } from "@orb/kit/errors";
import type { IdSource, ModelId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import { yieldToLoop } from "#primitives/abort";
import { calendarBucketStartSql } from "#primitives/calendar-bucket-sql";
import type { Accums, CanonMessage, CharChatMeta, ChatMeta, OwnerRollupRows, ReconcileOpts, SwipeRow } from "../contract/rebuild-from-canon.ts";
import {
  buildBucketRows,
  buildChatMeta,
  buildOwnerRows,
  createOwnerAccums,
  foldCanonMessage,
  foldCanonSwipe,
  foldSpend,
  ownerExtrema,
} from "../substrate/rebuild-rollups.ts";
import { ownerChatIds, retainedCharacterSeatPredicate } from "./owner-chat-scope.ts";

export type { ReconcileStatsResult } from "@orb/contracts/stats";

/** Rows per streaming page; bounds peak memory on large corpora. */
export const CHUNK = 5000;
// Per-table column counts for the bound-variable chunker — must track the insert shapes below.
const CHAR_COLS = 30;
const DAILY_COLS = 22;
const MODEL_COLS = 21;
const REBUILD_STARVED = "the library kept changing while its stats were rebuilt; the live totals are unchanged, try again shortly";

/** Full rebuild of the stats rollups from canon. `ownerId` scopes to one user; omit to rebuild every owner with
 *  canon or a rollup row: a character, an embedding call, a pending generation observation, or `owner_stats`,
 *  which every live spend writer lands. Aborts cooperatively between owners via `signal`. */
export async function reconcileStats(db: Db, opts: ReconcileOpts): Promise<ReconcileStatsResult> {
  const owners =
    opts.ownerId !== undefined && opts.ownerId !== ""
      ? [userIdSchema.parse(opts.ownerId)]
      : (
          await db.all<{ ownerId: unknown }>(
            sql`SELECT owner_id AS ownerId FROM characters UNION SELECT owner_id AS ownerId FROM embedding_calls UNION SELECT funder_user_id AS ownerId FROM chat_generation_observations UNION SELECT owner_id AS ownerId FROM owner_stats`,
          )
        ).map((r) => userIdSchema.parse(r.ownerId));

  const now = opts.now();
  const idSource = opts.idSource;
  let totalChars = 0;
  for (const ownerId of owners) {
    const built = await untilCanonStable(db, ownerId, opts.signal, (fence) => computeOwner(db, { ownerId, now, idSource, fence }));
    totalChars += built.charCount;
  }
  return { owners: owners.length, characters: totalChars };
}

/** Rebuild ONLY the `daily_stats` timeline of every owner whose rollups record activity — a turn, a chat, any
 *  spend, or a model row (an unpriced image generation) — but whose timeline is empty: the state a timeline
 *  re-grain migration leaves. The other rollups are left untouched,
 *  because they can hold compaction spend recorded before the spend ledger existed, which no canon re-derives.
 *  A live write always lands both rows, so the predicate is idempotent, except for an owner whose live rollups
 *  hold activity no canon row still carries: that pre-ledger compaction spend, or the counters of a room or
 *  character deleted since. Such an owner re-runs an empty (cheap) timeline rebuild each boot. A generated
 *  picture never leaves that state, because its provenance row retains its asset from every delete path.
 *  A shutdown during boot aborts it between owners through `signal`. Returns the owners rebuilt. */
export async function reconcileOwnersMissingTimeline(db: Db, now: () => number, idSource: IdSource, signal?: AbortSignal): Promise<number> {
  const owners = await db.all<{ ownerId: unknown }>(sql`
    SELECT o.owner_id AS ownerId FROM owner_stats o
    WHERE (o.user_turns + o.assistant_turns + o.system_turns + o.chats > 0
           OR o.cost_usd <> 0
           OR EXISTS (SELECT 1 FROM model_stats m WHERE m.owner_id = o.owner_id))
      AND NOT EXISTS (SELECT 1 FROM daily_stats d WHERE d.owner_id = o.owner_id)
  `);
  const stamp = now();
  for (const row of owners) {
    const ownerId = userIdSchema.parse(row.ownerId);
    await untilCanonStable(db, ownerId, signal, (fence) => computeOwnerTimeline(db, { ownerId, now: stamp, idSource, fence }));
  }
  return owners.length;
}

/** Run one owner's rebuild against the canon it read. The replace commits only while the owner's canon version and
 *  character count still equal the snapshot taken before the scan ({@link canonUnchangedStatement}), so a live write
 *  that raced the scan is never overwritten by the older fold: the replace rolls back and the fold runs again. A
 *  writer that outpaces every attempt leaves the live rollups as they were and refuses with a retry-later answer,
 *  never a total folded from canon that has since moved. */
async function untilCanonStable<T>(
  db: Db,
  ownerId: UserId,
  signal: AbortSignal | undefined,
  build: (fence: (stmts: BatchStmt[]) => void) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < STATS_REBUILD_ATTEMPTS; attempt++) {
    signal?.throwIfAborted();
    const before = await ownerCanonSnapshot(db, ownerId);
    try {
      return await build((stmts) => stmts.unshift(canonUnchangedStatement(db, ownerId, before)));
    } catch (error) {
      const violation = isConstraintViolation(error);
      if (violation?.kind !== "not-null" || violation.statementIndex !== 0) {
        throw error;
      }
    }
  }
  throw new DomainUnavailableError(REBUILD_STARVED);
}

// The owner's chats (membership, husk-excluding) is `persistence/owner-chat-scope.ts` — ONE home, shared with
// the on-read scans. It is reused by every per-owner scan below (the message stream, the daily
// chats-created histogram, the library totals); `loadChatMeta`'s per-character aggregate needs its own join
// shape (it GROUPs by participant) and carries the same arm inline.
//
// An agent-authored assistant row (characterId NULL) folds to the host owner + skips character_stats.
// A character-less agent-only room is un-constructable in v1, so that case is deferred, not built
// (docs/work/0048).

/** Owner-scoped canon version plus the owned-character count. Every stats-affecting live canon mutator
 *  increments `stats_canon_versions` through `applyStatsDelta` in the same batch as canon + rollups;
 *  comparing again after the rollup replace closes the scan/write window without holding a transaction
 *  across the streaming reads. A write after the second snapshot is safe: its live stats delta runs after
 *  the rebuild rather than being overwritten by it. */
export async function ownerCanonSnapshot(db: Db, ownerId: UserId): Promise<CanonSnapshot> {
  const [row] = await db.all<CanonSnapshot>(sql`SELECT ${canonVersionOf(ownerId)} AS canonVersion, ${characterCountOf(ownerId)} AS characterCount`);
  return row ?? { canonVersion: 0, characterCount: 0 };
}

export interface CanonSnapshot {
  readonly canonVersion: number;
  readonly characterCount: number;
}

const canonVersionOf = (ownerId: UserId): SQL => sql`COALESCE((SELECT version FROM stats_canon_versions WHERE owner_id = ${ownerId}), 0)`;
const characterCountOf = (ownerId: UserId): SQL => sql`(SELECT COUNT(*) FROM characters WHERE owner_id = ${ownerId})`;

/** The replace batch's first write: it rewrites the owner's version to itself while the snapshot still holds, and
 *  writes NULL into the NOT NULL column (rolling the whole batch back) once a live write has moved it. */
export function canonUnchangedStatement(db: Db, ownerId: UserId, before: CanonSnapshot): BatchStmt {
  return db
    .insert(statsCanonVersions)
    .values({
      ownerId,
      version: sql`(SELECT ${canonVersionOf(ownerId)} WHERE ${canonVersionOf(ownerId)} = ${before.canonVersion} AND ${characterCountOf(ownerId)} = ${before.characterCount})`,
    })
    .onConflictDoUpdate({ target: statsCanonVersions.ownerId, set: { version: sql`excluded.version` } });
}

/** Stream the messages of `rooms` (keyset-paged on m.id), each joined to its SELECTED variant. The rebuild scans an
 *  owner's whole chat set; a retirement scans only the rooms leaving it, through the same projection. */
export async function scanMessages(db: Db, rooms: SQL, visit: (row: CanonMessage) => void): Promise<void> {
  let lastId = "";
  for (;;) {
    // keyset PAGINATION over the owner's whole message corpus — the loop exists to bound memory, and one round trip per page is what streaming means. Ends if the rebuild folds server-side.
    const rows = await db.all<CanonMessage>(sql`
      SELECT m.id AS mid, m.character_id AS cid, m.role AS role, m.created_at AS createdAt,
             ch.created_at AS chatCreatedAt, v.content AS content,
             v.tokens_in AS ti, v.tokens_out AS tout, v.token_provenance AS tokenProvenance,
             v.gen_started_at AS gs, v.gen_finished_at AS gf,
             v.model AS model, v.provider AS provider, v.reasoning AS reasoning,
             json_extract(v.metadata, '$.reasoning_duration') AS reasoningDur,
             v.cost_usd AS cost, v.cache_read_tokens AS cacheR, v.cache_write_tokens AS cacheW,
             v.context_window AS ctx, v.idx AS selectedIdx,
             (SELECT COUNT(*) FROM message_variants vv WHERE vv.message_id = m.id) AS variantCount,
             v.metadata AS metadata,
             CASE WHEN json_type(v.metadata, '$.usageLegs') = 'array' THEN json_extract(v.metadata, '$.usageLegs') END AS usageLegs
      FROM messages m
      JOIN chats ch ON ch.id = m.chat_id
      LEFT JOIN message_variants v ON v.id = m.selected_variant_id
      WHERE m.chat_id IN (${rooms}) AND m.id > ${lastId}
      ORDER BY m.id ASC LIMIT ${CHUNK}
    `);
    if (rows.length === 0) {
      break;
    }
    for (const r of rows) {
      visit(r);
    }
    lastId = rows.at(-1)?.mid ?? lastId;
    if (rows.length < CHUNK) {
      break;
    }
    // A local read settles as a microtask, so without this the whole library is one turn of the loop. A write that
    // lands between pages moves the canon version, and `untilCanonStable` folds the owner again.
    await yieldToLoop();
  }
}

/** Stream the swipe variants (the NON-selected variants) of `rooms`, keyset-paged on mv.id. */
export async function scanSwipes(db: Db, rooms: SQL, visit: (row: SwipeRow) => void): Promise<void> {
  let lastId = "";
  for (;;) {
    // keyset PAGINATION over the owner's swipe variants, the sibling of the message scan above. Ends if the rebuild folds server-side.
    const rows = await db.all<SwipeRow>(sql`
      SELECT mv.id AS svid, m.character_id AS cid, m.created_at AS msgCreatedAt, mv.content AS content,
             mv.tokens_in AS ti, mv.tokens_out AS tout, mv.token_provenance AS tokenProvenance,
             mv.gen_started_at AS gs, mv.gen_finished_at AS gf,
             mv.model AS model, mv.provider AS provider, mv.reasoning AS reasoning,
             json_extract(mv.metadata, '$.reasoning_duration') AS reasoningDur,
             CASE WHEN json_type(mv.metadata, '$.usageLegs') = 'array' THEN json_extract(mv.metadata, '$.usageLegs') END AS usageLegs
      FROM message_variants mv
      JOIN messages m ON m.id = mv.message_id
      WHERE m.chat_id IN (${rooms})
        AND (m.selected_variant_id IS NULL OR mv.id != m.selected_variant_id)
        AND mv.id > ${lastId}
      ORDER BY mv.id ASC LIMIT ${CHUNK}
    `);
    if (rows.length === 0) {
      break;
    }
    for (const r of rows) {
      visit(r);
    }
    lastId = rows.at(-1)?.svid ?? lastId;
    if (rows.length < CHUNK) {
      break;
    }
    await yieldToLoop();
  }
}

// ── Spend outside the message canon ──────────────────────────────────────────────────────────────────────
// An image generation, a compaction pass and an image prompt's extraction or caption spend money without writing a
// message. Each live writer records a canon row (`imagery_generations`, `spend_ledger`) in the same batch as its stats
// delta, and builds
// that delta with a shared `@orb/contracts/stats` builder. The rebuild calls the SAME builder over the same
// recorded fields, then folds the delta onto the grains `applyStatsDelta` writes it to.

/** The owner's image generations, one group per provider call: every picture of a fanned-out call carries
 *  the call's `callId` (and shares its time, model, provider, connection and total cost, so those extra keys
 *  never split a call), and the row count is the picture count. Rows written before `call_id` existed hold
 *  NULL and group by the remaining key alone — best-effort for that legacy data: two such calls finishing in
 *  the same millisecond at the same cost merge into one. Owner-scoped through the asset. */
async function scanImageSpend(db: Db, ownerId: UserId, a: Accums): Promise<void> {
  const calls = await db
    .select({
      // Every producer writes one immutable execution body/time across its outputs. Stable aggregates
      // keep attribution-only FK loss from splitting a call or choosing an arbitrary context row.
      model: sql<ModelId>`min(${imageryGenerations.model})`,
      provider: sql<ProviderId | null>`min(${imageryGenerations.provider})`,
      costUsd: sql<number | null>`min(${imageryGenerations.costUsd})`,
      createdAt: sql<number>`min(${imageryGenerations.createdAt})`,
      genTimeMs: sql<number | null>`min(${imageryGenerations.genTimeMs})`,
      count: sql<number>`count(*)`,
    })
    .from(imageryGenerations)
    .innerJoin(assets, eq(assets.id, imageryGenerations.assetId))
    .where(eq(assets.ownerId, ownerId))
    .groupBy(sql`coalesce(${imageryGenerations.callId}, ${imageryGenerations.id})`);
  for (const call of calls) {
    foldSpend(imageGenerationSpendDelta({ ownerId, ...call, now: call.createdAt }), a);
  }
}

const ledgerRowColumns = {
  kind: spendLedger.kind,
  costUsd: spendLedger.costUsd,
  createdAt: spendLedger.createdAt,
  model: spendLedger.model,
  provider: spendLedger.provider,
  notional: spendLedger.notional,
};
type LedgerRow = { readonly ownerId: UserId } & Omit<typeof spendLedger.$inferSelect, "id" | "ownerId">;

const ledgerCallDelta = (row: LedgerRow): SpendDelta => ledgerSpendDelta({ ownerId: row.ownerId, costUsd: row.costUsd, now: row.createdAt });

// A priced side call is owner and timeline spend; retired canon keeps the model bucket it was paid on. A kind added to
// the tuple without an arm here fails `tsc`.
const LEDGER_FOLD: Readonly<Record<SpendLedgerKind, (row: LedgerRow) => SpendDelta>> = {
  compaction: ledgerCallDelta,
  "image-extraction": ledgerCallDelta,
  "image-caption": ledgerCallDelta,
  "retired-canon": (row) => retiredCanonSpendDelta({ ...row, now: row.createdAt }),
};

/** The owner's ledger spend: compaction passes, image prompt extractions and captions, and retired canon. */
async function scanLedgerSpend(db: Db, ownerId: UserId, a: Accums): Promise<void> {
  const rows = await db.select(ledgerRowColumns).from(spendLedger).where(eq(spendLedger.ownerId, ownerId));
  for (const row of rows) {
    foldSpend(LEDGER_FOLD[row.kind]({ ownerId, ...row }), a);
  }
}

async function scanEmbeddingSpend(db: Db, ownerId: UserId, a: Accums): Promise<void> {
  let lastId = "";
  for (;;) {
    // keyset pagination bounds the retained embedding-call corpus per page, matching the message/swipe scans. Ends if rebuild folds server-side.
    // owner-scoped inside the raw `sql` template (`embedding_calls.owner_id = ownerId`); the `id >` term is the keyset cursor, not a selection by a caller's id. Ends if the template loses its owner term.
    const calls = await db
      .select()
      .from(embeddingCalls)
      .where(sql`${embeddingCalls.ownerId} = ${ownerId} and ${embeddingCalls.id} > ${lastId}`)
      .orderBy(embeddingCalls.id)
      .limit(CHUNK);
    for (const call of calls) {
      foldSpend(
        embeddingSpendDelta({
          ownerId: call.ownerId,
          model: modelIdSchema.parse(call.model),
          provider: call.provider,
          promptTokens: call.promptTokens,
          costUsd: call.costUsd,
          now: call.createdAt,
        }),
        a,
      );
    }
    lastId = calls.at(-1)?.id ?? lastId;
    if (calls.length < CHUNK) {
      break;
    }
  }
}

async function scanGenerationObservations(db: Db, ownerId: UserId, a: Accums): Promise<void> {
  const rows = await db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.funderUserId, ownerId));
  for (const row of rows) {
    foldSpend(
      generationObservationSpendDelta({
        ownerId: row.funderUserId,
        leg: storedGenerationUsageLegSchema.parse({ ...row, responseCache: responseCacheSchema.safeParse(row.responseCache).data }),
      }),
      a,
    );
  }
}

/** The chat-level aggregates: per-character chat counts + first/last, per-bucket chatsCreated, owner library
 *  totals. Forks count independently — a fork is a separate playthrough, so a fork's copied canon is not
 *  content-hash-deduped. */
async function loadChatMeta(db: Db, ownerId: UserId): Promise<ChatMeta> {
  const chatAgg = await db.all<{ cid: string } & CharChatMeta>(sql`
    SELECT cp.character_id AS cid, COUNT(DISTINCT cp.chat_id) AS chats,
           SUM(CASE WHEN ch.parent_chat_id IS NOT NULL THEN 1 ELSE 0 END) AS forkedChats,
           MIN(ch.created_at) AS firstChatAt
    FROM chat_participants cp
    JOIN chats ch ON ch.id = cp.chat_id
    JOIN characters c ON c.id = cp.character_id
    WHERE ${retainedCharacterSeatPredicate(sql`${ownerId}`)}
    GROUP BY cp.character_id
  `);
  // The bucket is computed in SQL with the same floor `statsBucketStart` applies to a message.
  const chatBuckets = await db.all<{ bucketStart: number; n: number }>(sql`
    SELECT ${calendarBucketStartSql(sql`ch.created_at`)} AS bucketStart, COUNT(DISTINCT ch.id) AS n
    FROM chats ch WHERE ch.id IN (${ownerChatIds(ownerId)}) GROUP BY bucketStart
  `);
  const rooms = (
    await db.all<{ chats: number; forkedChats: number }>(sql`
      SELECT (SELECT COUNT(*) FROM (${ownerChatIds(ownerId)})) AS chats,
             (SELECT COUNT(*) FROM chats WHERE parent_chat_id IS NOT NULL
                AND id IN (${ownerChatIds(ownerId)})) AS forkedChats
    `)
  )[0] ?? { chats: 0, forkedChats: 0 };
  // The character count is the characters with a seat in a started room, the set the live write bumps on a
  // character's first such room (`StatsDelta.newCharacter`), never the whole library.
  return buildChatMeta(chatAgg, chatBuckets, { characters: chatAgg.length, ...rooms });
}

/** Atomic per-owner REPLACE: ONE db.batch of [delete ×4, insert owner_stats, ...chunked inserts] so a read
 *  never sees a half-rebuilt owner. character_stats is deleted by the owner's characters (it has no ownerId
 *  — D23). owner_stats is ALWAYS written (even all-zeros) so freshness distinguishes computed-empty. */
async function writeOwner(db: Db, ownerId: UserId, rows: OwnerRollupRows, fence: (stmts: BatchStmt[]) => void): Promise<void> {
  const stmts: BatchStmt[] = [
    db.delete(characterStats).where(sql`${characterStats.characterId} IN (SELECT id FROM characters WHERE owner_id = ${ownerId})`),
    db.delete(ownerStats).where(eq(ownerStats.ownerId, ownerId)),
    db.delete(dailyStats).where(eq(dailyStats.ownerId, ownerId)),
    db.delete(modelStats).where(eq(modelStats.ownerId, ownerId)),
    db.insert(ownerStats).values(rows.ownerRow),
  ];
  for (const chunk of chunkRows(rows.charRows, CHAR_COLS)) {
    stmts.push(db.insert(characterStats).values(chunk));
  }
  for (const chunk of chunkRows(rows.bucketRows, DAILY_COLS)) {
    stmts.push(db.insert(dailyStats).values(chunk));
  }
  for (const chunk of chunkRows(rows.modelRows, MODEL_COLS)) {
    stmts.push(db.insert(modelStats).values(chunk));
  }
  fence(stmts);
  await db.batch(batchMany(stmts));
}

/** One owner's canon folded into every rollup accumulator. */
async function foldOwnerCanon(db: Db, ownerId: UserId): Promise<{ a: Accums; meta: ChatMeta }> {
  const a = createOwnerAccums();
  const rooms = ownerChatIds(ownerId);
  await scanMessages(db, rooms, (row) => foldCanonMessage(ownerId, row, a));
  await scanSwipes(db, rooms, (row) => foldCanonSwipe(ownerId, row, a));
  await scanImageSpend(db, ownerId, a);
  await scanLedgerSpend(db, ownerId, a);
  await scanEmbeddingSpend(db, ownerId, a);
  await scanGenerationObservations(db, ownerId, a);
  const meta = await loadChatMeta(db, ownerId);
  return { a, meta };
}

/** One owner's rebuild: the clock it stamps, and the guard its replace batch opens with. */
interface OwnerRebuild {
  readonly ownerId: UserId;
  readonly now: number;
  readonly idSource: IdSource;
  readonly fence: (stmts: BatchStmt[]) => void;
}

/** Replace one owner's `daily_stats` timeline from canon, in one batch, leaving every other rollup as it is. */
async function computeOwnerTimeline(db: Db, { ownerId, now, idSource, fence }: OwnerRebuild): Promise<number> {
  const { a, meta } = await foldOwnerCanon(db, ownerId);
  const rows = buildBucketRows({ ownerId, idSource }, a.bucketMap, meta, now);
  const stmts: BatchStmt[] = [db.delete(dailyStats).where(eq(dailyStats.ownerId, ownerId))];
  for (const chunk of chunkRows(rows, DAILY_COLS)) {
    stmts.push(db.insert(dailyStats).values(chunk));
  }
  fence(stmts);
  await db.batch(batchMany(stmts));
  return rows.length;
}

async function computeOwner(db: Db, { ownerId, now, idSource, fence }: OwnerRebuild): Promise<{ charCount: number }> {
  const { a, meta } = await foldOwnerCanon(db, ownerId);
  ownerExtrema(a.owner, meta);

  const ownedCharacters = (await db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, ownerId))).map((row) => row.id);
  const rows = buildOwnerRows({ ownerId, ownedCharacterIds: ownedCharacters, idSource }, a, meta, now);
  await writeOwner(db, ownerId, rows, fence);
  return { charCount: rows.charRows.length };
}
