// Full RECONCILE: a memory-bounded streaming rebuild of the four rollup tables for one owner (or every
// owner) from canon — the backfill/post-import/drift-repair path (rollups are maintained live elsewhere).
// Canon includes the message stream and retained generation, embedding, imagery and compaction observations.
// Keyset-paged streams over messages + swipe variants (bounded peak memory); per-character/model/bucket
// accumulator Maps; atomic per-owner replace-write (one db.batch) so a read never sees a half-rebuilt owner.
// Owner-scoping follows the same retained host/character cohort predicates as the live accounting writers.

import type { ProviderId } from "@orb/contracts/inference";
import { modelIdSchema, responseCacheSchema, storedGenerationUsageLegSchema } from "@orb/contracts/inference";
import { compactionSpendDelta, embeddingSpendDelta, generationObservationSpendDelta, imageGenerationSpendDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import {
  assets,
  characterStats,
  characters,
  chatGenerationObservations,
  compactionSpend,
  dailyStats,
  embeddingCalls,
  imageryGenerations,
  modelStats,
  ownerStats,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, chunkRows, rowsPerInsert } from "@orb/db/kit";
import type { ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { calendarBucketStartSql } from "#kit/calendar-bucket-sql";
import type { Accums, CharChatMeta, ChatMeta, MessageRow, OwnerRollupRows, ReconcileOpts, SwipeRow } from "../contract/rebuild-from-canon.ts";
import type { ReconcileStatsResult } from "../contract/results.ts";
import { ownerChatIds, retainedCharacterSeatPredicate } from "../substrate/owner-chat-scope.ts";
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

export type { ReconcileStatsResult } from "../contract/results.ts";

const CHUNK = 5000; // rows per streaming page — bounds peak memory on large corpora
// Per-table column counts for the bound-variable chunker — must track the insert shapes below.
const CHAR_COLS = 30;
const DAILY_COLS = 22;
const MODEL_COLS = 21;

/** Full rebuild of the stats rollups from canon. `ownerId` scopes to one user; omit to rebuild every owner
 *  that owns a character. Aborts cooperatively between owners via `signal`. */
export async function reconcileStats(db: Db, opts: ReconcileOpts): Promise<ReconcileStatsResult> {
  const owners =
    opts.ownerId !== undefined && opts.ownerId !== ""
      ? [opts.ownerId]
      : (
          await db.all<{ ownerId: string }>(
            sql`SELECT owner_id AS ownerId FROM characters UNION SELECT owner_id AS ownerId FROM embedding_calls UNION SELECT funder_user_id AS ownerId FROM chat_generation_observations UNION SELECT owner_id AS ownerId FROM owner_stats`,
          )
        ).map((r) => r.ownerId);

  const now = opts.now();
  let totalChars = 0;
  let totalBuckets = 0;
  let totalModels = 0;
  for (const ownerId of owners) {
    const built = await untilCanonStable(db, ownerId, opts.signal, () => computeOwner(db, ownerId, now));
    totalChars += built.charCount;
    totalBuckets += built.bucketCount;
    totalModels += built.modelCount;
  }
  return {
    owners: owners.length,
    characters: totalChars,
    buckets: totalBuckets,
    models: totalModels,
    computedAt: now,
  };
}

/** Rebuild ONLY the `daily_stats` timeline of every owner whose rollups record activity — a turn, a chat, any
 *  spend, or a model row (an unpriced image generation) — but whose timeline is empty: the state a timeline
 *  re-grain migration leaves. The other rollups are left untouched,
 *  because they can hold compaction spend recorded before its `compaction_spend` ledger existed, which no
 *  canon re-derives. A live write always lands both rows, so the predicate is idempotent — except for an owner
 *  whose only activity is that pre-ledger compaction spend, who re-runs an empty (cheap) rebuild each boot.
 *  Returns the owners rebuilt. */
export async function reconcileOwnersMissingTimeline(db: Db, now: () => number): Promise<number> {
  const owners = await db.all<{ ownerId: string }>(sql`
    SELECT o.owner_id AS ownerId FROM owner_stats o
    WHERE (o.user_turns + o.assistant_turns + o.system_turns + o.chats > 0
           OR o.cost_usd <> 0
           OR EXISTS (SELECT 1 FROM model_stats m WHERE m.owner_id = o.owner_id))
      AND NOT EXISTS (SELECT 1 FROM daily_stats d WHERE d.owner_id = o.owner_id)
  `);
  const stamp = now();
  for (const { ownerId } of owners) {
    await untilCanonStable(db, ownerId, undefined, () => computeOwnerTimeline(db, ownerId, stamp));
  }
  return owners.length;
}

/** Run one owner's rebuild until canon held still across it, so a live write that raced the scan is never
 *  overwritten by the older fold. */
async function untilCanonStable<T>(db: Db, ownerId: string, signal: AbortSignal | undefined, build: () => Promise<T>): Promise<T> {
  for (;;) {
    signal?.throwIfAborted();
    const before = await ownerCanonSnapshot(db, ownerId);
    const built = await build();
    if (before === (await ownerCanonSnapshot(db, ownerId))) {
      return built;
    }
  }
}

// The owner's chats (membership, husk-excluding) is `substrate/owner-chat-scope.ts` — ONE home, shared with
// the on-read scans (#1477). It is reused by every per-owner scan below (the message stream, the daily
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
async function ownerCanonSnapshot(db: Db, ownerId: string): Promise<string> {
  const rows = await db.all<{ canonVersion: number; characterCount: number }>(sql`
    SELECT COALESCE((SELECT version FROM stats_canon_versions WHERE owner_id = ${ownerId}), 0) AS canonVersion,
           (SELECT COUNT(*) FROM characters WHERE owner_id = ${ownerId}) AS characterCount
  `);
  return JSON.stringify(rows);
}

/** Stream the owner's messages (keyset-paged on m.id), folding each message's SELECTED variant. */
async function scanMessages(db: Db, ownerId: string, a: Accums): Promise<void> {
  let lastId = "";
  for (;;) {
    // @orb-waive no-await-db-in-loop(all): keyset PAGINATION over the owner's whole message corpus — the loop exists to bound memory, and one round trip per page is what streaming means. Ends if the rebuild folds server-side.
    const rows = await db.all<MessageRow>(sql`
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
      WHERE m.chat_id IN (${ownerChatIds(ownerId)}) AND m.id > ${lastId}
      ORDER BY m.id ASC LIMIT ${CHUNK}
    `);
    if (rows.length === 0) {
      break;
    }
    for (const r of rows) {
      foldCanonMessage(ownerId, r, a);
    }
    lastId = rows.at(-1)?.mid ?? lastId;
    if (rows.length < CHUNK) {
      break;
    }
  }
}

/** Stream the owner's swipe variants (the NON-selected variants), keyset-paged on mv.id. */
async function scanSwipes(db: Db, ownerId: string, a: Accums): Promise<void> {
  let lastId = "";
  for (;;) {
    // @orb-waive no-await-db-in-loop(all): keyset PAGINATION over the owner's swipe variants, the sibling of the message scan above. Ends if the rebuild folds server-side.
    const rows = await db.all<SwipeRow>(sql`
      SELECT mv.id AS svid, m.character_id AS cid, m.created_at AS msgCreatedAt, mv.content AS content,
             mv.tokens_in AS ti, mv.tokens_out AS tout, mv.token_provenance AS tokenProvenance,
             mv.gen_started_at AS gs, mv.gen_finished_at AS gf,
             mv.model AS model, mv.provider AS provider, mv.reasoning AS reasoning,
             json_extract(mv.metadata, '$.reasoning_duration') AS reasoningDur,
             CASE WHEN json_type(mv.metadata, '$.usageLegs') = 'array' THEN json_extract(mv.metadata, '$.usageLegs') END AS usageLegs
      FROM message_variants mv
      JOIN messages m ON m.id = mv.message_id
      WHERE m.chat_id IN (${ownerChatIds(ownerId)})
        AND (m.selected_variant_id IS NULL OR mv.id != m.selected_variant_id)
        AND mv.id > ${lastId}
      ORDER BY mv.id ASC LIMIT ${CHUNK}
    `);
    if (rows.length === 0) {
      break;
    }
    for (const r of rows) {
      foldCanonSwipe(ownerId, r, a);
    }
    lastId = rows.at(-1)?.svid ?? lastId;
    if (rows.length < CHUNK) {
      break;
    }
  }
}

// ── Spend outside the message canon ──────────────────────────────────────────────────────────────────────
// An image generation and a compaction pass spend money without writing a message. Each live writer records
// a canon row (`imagery_generations`, `compaction_spend`) in the same batch as its stats delta, and builds
// that delta with a shared `@orb/contracts/stats` builder. The rebuild calls the SAME builder over the same
// recorded fields, then folds the delta onto the grains `applyStatsDelta` writes it to.

/** The owner's image generations, one group per provider call: every picture of a fanned-out call carries
 *  the call's `callId` (and shares its time, model, provider, connection and total cost, so those extra keys
 *  never split a call), and the row count is the picture count. Rows written before `call_id` existed hold
 *  NULL and group by the remaining key alone — best-effort for that legacy data: two such calls finishing in
 *  the same millisecond at the same cost merge into one. Owner-scoped through the asset. */
async function scanImageSpend(db: Db, ownerId: string, a: Accums): Promise<void> {
  const calls = await db
    .select({
      // Every producer writes one immutable execution body/time across its outputs. Stable aggregates
      // keep attribution-only FK loss from splitting a call or choosing an arbitrary context row.
      model: sql<ModelId>`min(${imageryGenerations.model})`,
      provider: sql<ProviderId | null>`min(${imageryGenerations.provider})`,
      costUsd: sql<number | null>`min(${imageryGenerations.costUsd})`,
      createdAt: sql<number>`min(${imageryGenerations.createdAt})`,
      count: sql<number>`count(*)`,
    })
    .from(imageryGenerations)
    .innerJoin(assets, eq(assets.id, imageryGenerations.assetId))
    .where(eq(assets.ownerId, castId<UserId>(ownerId)))
    .groupBy(sql`coalesce(${imageryGenerations.callId}, ${imageryGenerations.id})`);
  for (const call of calls) {
    foldSpend(imageGenerationSpendDelta({ ownerId: castId<UserId>(ownerId), ...call, now: call.createdAt }), a);
  }
}

/** The owner's priced compaction passes. */
async function scanCompactionSpend(db: Db, ownerId: string, a: Accums): Promise<void> {
  const passes = await db
    .select({ costUsd: compactionSpend.costUsd, createdAt: compactionSpend.createdAt })
    .from(compactionSpend)
    .where(eq(compactionSpend.ownerId, castId<UserId>(ownerId)));
  for (const pass of passes) {
    foldSpend(compactionSpendDelta({ ownerId: castId<UserId>(ownerId), costUsd: pass.costUsd, now: pass.createdAt }), a);
  }
}

async function scanEmbeddingSpend(db: Db, ownerId: string, a: Accums): Promise<void> {
  let lastId = "";
  for (;;) {
    // @orb-waive no-await-db-in-loop(limit): keyset pagination bounds the retained embedding-call corpus per page, matching the message/swipe scans. Ends if rebuild folds server-side.
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

async function scanGenerationObservations(db: Db, ownerId: string, a: Accums): Promise<void> {
  const rows = await db
    .select()
    .from(chatGenerationObservations)
    .where(eq(chatGenerationObservations.funderUserId, castId<UserId>(ownerId)));
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
async function loadChatMeta(db: Db, ownerId: string): Promise<ChatMeta> {
  const chatAgg = await db.all<{ cid: string } & CharChatMeta>(sql`
    SELECT cp.character_id AS cid, COUNT(DISTINCT cp.chat_id) AS chats,
           SUM(CASE WHEN ch.parent_chat_id IS NOT NULL THEN 1 ELSE 0 END) AS forkedChats,
           MIN(ch.created_at) AS firstChatAt, MAX(ch.updated_at) AS maxChatUpdated
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
  const library = (
    await db.all<{ characters: number; chats: number; forkedChats: number }>(sql`
      SELECT (SELECT COUNT(*) FROM characters WHERE owner_id = ${ownerId}) AS characters,
             (SELECT COUNT(*) FROM (${ownerChatIds(ownerId)})) AS chats,
             (SELECT COUNT(*) FROM chats WHERE parent_chat_id IS NOT NULL
                AND id IN (${ownerChatIds(ownerId)})) AS forkedChats
    `)
  )[0] ?? { characters: 0, chats: 0, forkedChats: 0 };
  return buildChatMeta(chatAgg, chatBuckets, library);
}

/** Atomic per-owner REPLACE: ONE db.batch of [delete ×4, insert owner_stats, ...chunked inserts] so a read
 *  never sees a half-rebuilt owner. character_stats is deleted by the owner's characters (it has no ownerId
 *  — D23). owner_stats is ALWAYS written (even all-zeros) so freshness distinguishes computed-empty. */
async function writeOwner(db: Db, ownerId: string, rows: OwnerRollupRows): Promise<void> {
  const stmts: BatchStmt[] = [
    db.delete(characterStats).where(sql`${characterStats.characterId} IN (SELECT id FROM characters WHERE owner_id = ${ownerId})`),
    db.delete(ownerStats).where(eq(ownerStats.ownerId, castId<UserId>(ownerId))),
    db.delete(dailyStats).where(eq(dailyStats.ownerId, castId<UserId>(ownerId))),
    db.delete(modelStats).where(eq(modelStats.ownerId, castId<UserId>(ownerId))),
    db.insert(ownerStats).values(rows.ownerRow),
  ];
  for (const chunk of chunkRows(rows.charRows, rowsPerInsert(CHAR_COLS))) {
    stmts.push(db.insert(characterStats).values(chunk));
  }
  for (const chunk of chunkRows(rows.bucketRows, rowsPerInsert(DAILY_COLS))) {
    stmts.push(db.insert(dailyStats).values(chunk));
  }
  for (const chunk of chunkRows(rows.modelRows, rowsPerInsert(MODEL_COLS))) {
    stmts.push(db.insert(modelStats).values(chunk));
  }
  await db.batch(batchMany(stmts));
}

/** One owner's canon folded into every rollup accumulator. */
async function foldOwnerCanon(db: Db, ownerId: string): Promise<{ a: Accums; meta: ChatMeta }> {
  const a = createOwnerAccums();
  await scanMessages(db, ownerId, a);
  await scanSwipes(db, ownerId, a);
  await scanImageSpend(db, ownerId, a);
  await scanCompactionSpend(db, ownerId, a);
  await scanEmbeddingSpend(db, ownerId, a);
  await scanGenerationObservations(db, ownerId, a);
  const meta = await loadChatMeta(db, ownerId);
  return { a, meta };
}

/** Replace one owner's `daily_stats` timeline from canon, in one batch, leaving every other rollup as it is. */
async function computeOwnerTimeline(db: Db, ownerId: string, now: number): Promise<number> {
  const { a, meta } = await foldOwnerCanon(db, ownerId);
  const rows = buildBucketRows(castId<UserId>(ownerId), a.bucketMap, meta, now);
  const stmts: BatchStmt[] = [db.delete(dailyStats).where(eq(dailyStats.ownerId, castId<UserId>(ownerId)))];
  for (const chunk of chunkRows(rows, rowsPerInsert(DAILY_COLS))) {
    stmts.push(db.insert(dailyStats).values(chunk));
  }
  await db.batch(batchMany(stmts));
  return rows.length;
}

async function computeOwner(db: Db, ownerId: string, now: number): Promise<{ charCount: number; bucketCount: number; modelCount: number }> {
  const { a, meta } = await foldOwnerCanon(db, ownerId);
  ownerExtrema(a.owner, meta);

  const oid = castId<UserId>(ownerId);
  const ownedCharacters = (await db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, oid))).map((row) => row.id);
  const rows = buildOwnerRows(oid, a, meta, now, ownedCharacters);
  await writeOwner(db, ownerId, rows);
  return {
    charCount: rows.charRows.length,
    bucketCount: rows.bucketRows.length,
    modelCount: rows.modelRows.length,
  };
}
