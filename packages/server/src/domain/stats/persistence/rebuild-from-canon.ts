// Full RECONCILE: a memory-bounded streaming rebuild of the four rollup tables for one owner (or every
// owner) from canon — the backfill/post-import/drift-repair path (rollups are maintained live elsewhere).
// Canon includes the message stream and retained generation, embedding, imagery and compaction observations.
// Keyset-paged streams over messages + swipe variants (bounded peak memory); per-character/model/bucket
// accumulator Maps; atomic per-owner replace-write (one db.batch) so a read never sees a half-rebuilt owner.
// Owner-scoping follows the same retained host/character cohort predicates as the live accounting writers.

import type { TokenProvenance } from "@orb/contracts/chat";
import { legacyNotionalCostSamples, parseVariantMetadata } from "@orb/contracts/chat";
import type { GenerationUsageLeg, ProviderId } from "@orb/contracts/inference";
import { generationUsageLegSchema, modelIdSchema, providerIdSchema, responseCacheSchema, storedGenerationUsageLegSchema } from "@orb/contracts/inference";
import type { SpendDeltaField, StatsDelta } from "@orb/contracts/stats";
import {
  compactionSpendDelta,
  embeddingSpendDelta,
  generationObservationSpendDelta,
  imageGenerationSpendDelta,
  SPEND_DELTA_FIELDS,
  variantUsageLegDelta,
} from "@orb/contracts/stats";
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
import type { CharacterId, ModelId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { MODEL_PROVIDER_UNKNOWN, statsBucketStart, wordCount } from "@orb/kit/stats-tally";
import { eq, sql } from "drizzle-orm";
import { calendarBucketStartSql } from "#kit/calendar-bucket-sql";
import type { ReconcileStatsResult } from "../contract/results.ts";
import { ownerChatIds, retainedCharacterSeatPredicate } from "../substrate/owner-chat-scope.ts";

export type { ReconcileStatsResult } from "../contract/results.ts";

const CHUNK = 5000; // rows per streaming page — bounds peak memory on large corpora
const DAY_MS = 86_400_000;
const MIGRATION_GAP_DAYS = 30; // a message >30d after its chat's creation = migrated (createdAt clobbered)
const MIGRATION_GAP_MS = MIGRATION_GAP_DAYS * DAY_MS;
// Per-table column counts for the bound-variable chunker — must track the insert shapes below.
const CHAR_COLS = 30;
const DAILY_COLS = 22;
const MODEL_COLS = 21;

interface TokenSampleAccum {
  tokensInMeasuredSamples: number;
  tokensInEstimatedSamples: number;
  tokensOutMeasuredSamples: number;
  tokensOutEstimatedSamples: number;
}

interface CharAccum extends TokenSampleAccum {
  userTurns: number;
  assistantTurns: number;
  systemTurns: number;
  swipes: number;
  userWords: number;
  assistantWords: number;
  swipeWords: number;
  tokensIn: number;
  tokensOut: number;
  genTimeMs: number;
  genSamples: number;
  reasoningGenerations: number;
  reasoningMs: number;
  costUsd: number;
  costSamples: number;
  notionalCostSamples: number;
  activeIdxSum: number;
  variantMessages: number;
  contentChars: number;
  lastMsgAt: number;
}
interface ModelAccum extends TokenSampleAccum {
  generations: number;
  tokensIn: number;
  tokensOut: number;
  genTimeMs: number;
  genSamples: number;
  reasoningGenerations: number;
  reasoningMs: number;
  costUsd: number;
  costSamples: number;
  notionalCostSamples: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
interface BucketAccum extends TokenSampleAccum {
  userTurns: number;
  assistantTurns: number;
  systemTurns: number;
  swipes: number;
  userWords: number;
  assistantWords: number;
  tokensIn: number;
  tokensOut: number;
  genTimeMs: number;
  costUsd: number;
  costSamples: number;
  notionalCostSamples: number;
  approx: boolean;
}
interface OwnerAccum extends TokenSampleAccum {
  userTurns: number;
  assistantTurns: number;
  systemTurns: number;
  swipes: number;
  userWords: number;
  assistantWords: number;
  swipeWords: number;
  tokensIn: number;
  tokensOut: number;
  genTimeMs: number;
  genSamples: number;
  reasoningGenerations: number;
  reasoningMs: number;
  costUsd: number;
  costSamples: number;
  notionalCostSamples: number;
  activeIdxSum: number;
  variantMessages: number;
  contentChars: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  maxContextTokens: number | null;
  firstChatAt: number | null;
  lastActivityAt: number;
}
interface ModelEntry {
  model: ModelId;
  provider: ProviderId | null;
  acc: ModelAccum;
}
/** The per-owner accumulator bundle threaded through the fold/scan helpers (one param, not four). */
interface Accums {
  owner: OwnerAccum;
  charMap: Map<string, CharAccum>;
  bucketMap: Map<number, BucketAccum>;
  modelMap: Map<string, ModelEntry>;
}

const freshChar = (): CharAccum => ({
  userTurns: 0,
  assistantTurns: 0,
  systemTurns: 0,
  swipes: 0,
  userWords: 0,
  assistantWords: 0,
  swipeWords: 0,
  tokensIn: 0,
  tokensOut: 0,
  tokensInMeasuredSamples: 0,
  tokensInEstimatedSamples: 0,
  tokensOutMeasuredSamples: 0,
  tokensOutEstimatedSamples: 0,
  genTimeMs: 0,
  genSamples: 0,
  reasoningGenerations: 0,
  reasoningMs: 0,
  costUsd: 0,
  costSamples: 0,
  notionalCostSamples: 0,
  activeIdxSum: 0,
  variantMessages: 0,
  contentChars: 0,
  lastMsgAt: 0,
});
const freshModel = (): ModelAccum => ({
  generations: 0,
  tokensIn: 0,
  tokensOut: 0,
  tokensInMeasuredSamples: 0,
  tokensInEstimatedSamples: 0,
  tokensOutMeasuredSamples: 0,
  tokensOutEstimatedSamples: 0,
  genTimeMs: 0,
  genSamples: 0,
  reasoningGenerations: 0,
  reasoningMs: 0,
  costUsd: 0,
  costSamples: 0,
  notionalCostSamples: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});
const freshBucket = (): BucketAccum => ({
  userTurns: 0,
  assistantTurns: 0,
  systemTurns: 0,
  swipes: 0,
  userWords: 0,
  assistantWords: 0,
  tokensIn: 0,
  tokensOut: 0,
  tokensInMeasuredSamples: 0,
  tokensInEstimatedSamples: 0,
  tokensOutMeasuredSamples: 0,
  tokensOutEstimatedSamples: 0,
  genTimeMs: 0,
  costUsd: 0,
  costSamples: 0,
  notionalCostSamples: 0,
  approx: false,
});
const freshOwner = (): OwnerAccum => ({
  userTurns: 0,
  assistantTurns: 0,
  systemTurns: 0,
  swipes: 0,
  userWords: 0,
  assistantWords: 0,
  swipeWords: 0,
  tokensIn: 0,
  tokensOut: 0,
  tokensInMeasuredSamples: 0,
  tokensInEstimatedSamples: 0,
  tokensOutMeasuredSamples: 0,
  tokensOutEstimatedSamples: 0,
  genTimeMs: 0,
  genSamples: 0,
  reasoningGenerations: 0,
  reasoningMs: 0,
  costUsd: 0,
  costSamples: 0,
  notionalCostSamples: 0,
  activeIdxSum: 0,
  variantMessages: 0,
  contentChars: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  maxContextTokens: null,
  firstChatAt: null,
  lastActivityAt: 0,
});

function get<K, V>(map: Map<K, V>, key: K, mk: () => V): V {
  let v = map.get(key);
  if (v === undefined) {
    v = mk();
    map.set(key, v);
  }
  return v;
}

interface GenRow {
  ti: number | null;
  tout: number | null;
  tokenProvenance: TokenProvenance;
  gs: number | null;
  gf: number | null;
  reasoning: string | null;
  reasoningDur: number | null;
}

function foldTokenSamples(acc: TokenSampleAccum, r: Pick<GenRow, "ti" | "tout" | "tokenProvenance">): void {
  if (r.tokenProvenance === "unrecorded") {
    return;
  }
  const kind = r.tokenProvenance === "measured" ? "MeasuredSamples" : "EstimatedSamples";
  if (r.ti !== null) {
    acc[`tokensIn${kind}`]++;
  }
  if (r.tout !== null) {
    acc[`tokensOut${kind}`]++;
  }
}

/** metadata.reasoning_duration as non-negative rounded ms, or 0 when absent/invalid.
 *  THE PATH LITERAL: `'$.reasoning_duration'` in the two queries below is the ONE key
 *  `VARIANT_METADATA_REASONING_MS_KEY` (`@orb/contracts/chat`) names — spelled inline because an
 *  interpolated value inside a `sql` template binds as a PARAMETER, not as a JSON path. Its live producer is
 *  the turn engine (#184); the ST import writes the same key on the import path. */
function reasoningMsOf(r: GenRow): number {
  const d = Number(r.reasoningDur);
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}
/** A non-empty reasoning/thinking snapshot was recorded on this row. */
function hasReasoning(r: GenRow): boolean {
  return r.reasoning !== null && r.reasoning.trim().length > 0;
}
/** The completed gen window (gf−gs) when both bounds are present and ordered, else null. */
function genDurationMs(r: GenRow): number | null {
  return r.gs !== null && r.gf !== null && r.gf >= r.gs ? r.gf - r.gs : null;
}

/** Fold one generation row into a model accumulator's COMMON columns (cost/cache folded by the caller). */
function foldModelGen(m: ModelAccum, r: GenRow): void {
  m.generations++;
  m.tokensIn += r.ti ?? 0;
  m.tokensOut += r.tout ?? 0;
  foldTokenSamples(m, r);
  m.reasoningMs += reasoningMsOf(r);
  const d = genDurationMs(r);
  if (d !== null) {
    m.genTimeMs += d;
    m.genSamples++;
  }
  if (hasReasoning(r)) {
    m.reasoningGenerations++;
  }
}

function modelMapKey(model: string, provider: string | null): string {
  return `${model} ${provider ?? MODEL_PROVIDER_UNKNOWN}`;
}

function modelIdentity(model: string | null, provider: string | null): Omit<ModelEntry, "acc"> | null {
  if (model === null) {
    return null;
  }
  const parsedModel = modelIdSchema.safeParse(model);
  if (!parsedModel.success) {
    return null;
  }
  return {
    model: parsedModel.data,
    provider: provider === null ? null : (providerIdSchema.safeParse(provider).data ?? null),
  };
}

interface ReconcileOpts {
  /** Scope to one owner; omit to rebuild every owner that owns a character. */
  ownerId?: string;
  /** INJECTED clock (epoch-ms) — the determinism seam (no-raw-clock). Stamped as every row's computedAt. */
  now: () => number;
  /** Cooperative abort between owners. */
  signal?: AbortSignal;
}

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

interface MessageRow {
  mid: string;
  cid: string | null;
  role: string;
  createdAt: number;
  chatCreatedAt: number;
  content: string | null;
  ti: number | null;
  tout: number | null;
  tokenProvenance: TokenProvenance;
  gs: number | null;
  gf: number | null;
  model: string | null;
  provider: string | null;
  reasoning: string | null;
  reasoningDur: number | null;
  cost: number | null;
  cacheR: number | null;
  cacheW: number | null;
  ctx: number | null;
  selectedIdx: number | null;
  variantCount: number;
  usageLegs: string | null;
  metadata: string | null;
}

// SQLite returns serialized JSON only for the array arm selected by both scans.
function usageLegsOf(raw: string | null): readonly GenerationUsageLeg[] {
  return raw === null ? [] : (generationUsageLegSchema.array().safeParse(JSON.parse(raw)).data ?? []);
}

function foldVariantLegs(
  args: { readonly ownerId: string; readonly cid: string | null; readonly legs: readonly GenerationUsageLeg[]; readonly selected: boolean },
  a: Accums,
): void {
  const { ownerId, cid, legs, selected } = args;
  for (const leg of legs) {
    const delta = variantUsageLegDelta({
      ownerId: castId<UserId>(ownerId),
      characterId: cid === null ? null : castId<CharacterId>(cid),
      leg,
      selected,
      sign: 1,
      now: leg.observedAt,
    });
    foldSpend(delta, a);
    if (cid !== null) {
      const character = get(a.charMap, cid, freshChar);
      character.tokensIn += delta.tokensIn ?? 0;
      character.tokensOut += delta.tokensOut ?? 0;
      character.tokensInMeasuredSamples += delta.tokensInMeasuredSamples ?? 0;
      character.tokensOutMeasuredSamples += delta.tokensOutMeasuredSamples ?? 0;
      character.costUsd += delta.costUsd ?? 0;
      character.costSamples += delta.costSamples ?? 0;
      character.notionalCostSamples += delta.notionalCostSamples ?? 0;
      character.lastMsgAt = Math.max(character.lastMsgAt, delta.lastAt ?? 0);
    }
  }
}

/** Owner-grain economics from a message's SELECTED variant (tokens/cost/cache/ctx/chars/gen/reasoning). */
function foldOwnerMessage(owner: OwnerAccum, bucket: BucketAccum, r: MessageRow): void {
  const chars = r.content?.length ?? 0;
  owner.contentChars += chars;
  owner.tokensIn += r.ti ?? 0;
  owner.tokensOut += r.tout ?? 0;
  foldTokenSamples(owner, r);
  owner.costUsd += r.cost ?? 0;
  owner.costSamples += Number(r.cost !== null);
  owner.cacheReadTokens += r.cacheR ?? 0;
  owner.cacheWriteTokens += r.cacheW ?? 0;
  owner.reasoningMs += reasoningMsOf(r);
  if (r.ctx !== null && (owner.maxContextTokens === null || r.ctx > owner.maxContextTokens)) {
    owner.maxContextTokens = r.ctx;
  }
  if (r.createdAt > owner.lastActivityAt) {
    owner.lastActivityAt = r.createdAt;
  }
  bucket.tokensIn += r.ti ?? 0;
  bucket.tokensOut += r.tout ?? 0;
  foldTokenSamples(bucket, r);
  bucket.costUsd += r.cost ?? 0;
  bucket.costSamples += Number(r.cost !== null);
  const gen = genDurationMs(r);
  if (gen !== null) {
    owner.genTimeMs += gen;
    owner.genSamples++;
    bucket.genTimeMs += gen;
  }
}

/** Turn/word counts split on role (ST is_user binary: userWords vs non-user assistant+system words). */
function foldRoleCounts(owner: OwnerAccum, bucket: BucketAccum, r: MessageRow): void {
  const words = wordCount(r.content);
  if (r.role === "user") {
    owner.userTurns++;
    owner.userWords += words;
    bucket.userTurns++;
    bucket.userWords += words;
    return;
  }
  owner.assistantWords += words;
  bucket.assistantWords += words;
  if (r.role === "system") {
    owner.systemTurns++;
    bucket.systemTurns++;
  } else {
    owner.assistantTurns++;
    bucket.assistantTurns++;
  }
}

/** Per-character grain (assistant only; system/user carry no characterId). */
function foldMessageChar(charMap: Map<string, CharAccum>, r: MessageRow): void {
  const c = get(charMap, r.cid as string, freshChar);
  c.assistantTurns++;
  c.assistantWords += wordCount(r.content);
  c.contentChars += r.content?.length ?? 0;
  c.tokensIn += r.ti ?? 0;
  c.tokensOut += r.tout ?? 0;
  foldTokenSamples(c, r);
  c.costUsd += r.cost ?? 0;
  c.costSamples += r.cost === null ? 0 : 1;
  c.reasoningMs += reasoningMsOf(r);
  const gen = genDurationMs(r);
  if (gen !== null) {
    c.genTimeMs += gen;
    c.genSamples++;
  }
  if (hasReasoning(r)) {
    c.reasoningGenerations++;
  }
  if (r.variantCount > 1 && r.selectedIdx !== null) {
    c.variantMessages++;
    c.activeIdxSum += r.selectedIdx;
  }
  if (r.createdAt > c.lastMsgAt) {
    c.lastMsgAt = r.createdAt;
  }
}

/** Fold one message (its SELECTED variant — the kept take) across owner/char/bucket/model accumulators. */
function foldMessage(r: MessageRow, a: Accums): void {
  const notionalSamples = legacyNotionalCostSamples(r.cost, parseVariantMetadata(r.metadata === null ? null : JSON.parse(r.metadata)));
  const bucket = get(a.bucketMap, statsBucketStart(r.createdAt), freshBucket);
  if (r.createdAt - r.chatCreatedAt > MIGRATION_GAP_MS) {
    bucket.approx = true;
  }
  foldOwnerMessage(a.owner, bucket, r);
  a.owner.notionalCostSamples += notionalSamples;
  bucket.notionalCostSamples += notionalSamples;
  foldRoleCounts(a.owner, bucket, r);
  // Settle depth: a re-rolled message (>1 variant) contributes its SELECTED idx (the take you kept).
  if (r.variantCount > 1 && r.selectedIdx !== null) {
    a.owner.variantMessages++;
    a.owner.activeIdxSum += r.selectedIdx;
  }
  if (r.role === "assistant" && hasReasoning(r)) {
    a.owner.reasoningGenerations++;
  }
  if (r.role === "assistant" && r.cid !== null) {
    foldMessageChar(a.charMap, r);
    get(a.charMap, r.cid, freshChar).notionalCostSamples += notionalSamples;
  }
  const identity = r.role === "assistant" ? modelIdentity(r.model, r.provider) : null;
  if (identity !== null) {
    const entry = get(a.modelMap, modelMapKey(identity.model, identity.provider), () => ({
      ...identity,
      acc: freshModel(),
    }));
    foldModelGen(entry.acc, r);
    entry.acc.costUsd += r.cost ?? 0;
    entry.acc.costSamples += r.cost === null ? 0 : 1;
    entry.acc.notionalCostSamples += notionalSamples;
    entry.acc.cacheReadTokens += r.cacheR ?? 0;
    entry.acc.cacheWriteTokens += r.cacheW ?? 0;
  }
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
      const legs = usageLegsOf(r.usageLegs);
      foldMessage(legs.length === 0 ? r : { ...r, ti: null, tout: null, cost: null, cacheR: null, cacheW: null, tokenProvenance: "unrecorded" }, a);
      foldVariantLegs({ ownerId, cid: r.role === "assistant" ? r.cid : null, legs, selected: true }, a);
    }
    lastId = rows.at(-1)?.mid ?? lastId;
    if (rows.length < CHUNK) {
      break;
    }
  }
}

interface SwipeRow {
  svid: string;
  cid: string | null;
  msgCreatedAt: number;
  content: string | null;
  ti: number | null;
  tout: number | null;
  tokenProvenance: TokenProvenance;
  gs: number | null;
  gf: number | null;
  model: string | null;
  provider: string | null;
  reasoning: string | null;
  reasoningDur: number | null;
  usageLegs: string | null;
}

/** Per-character swipe fold (assistant re-rolls). */
function foldSwipeChar(charMap: Map<string, CharAccum>, r: SwipeRow): void {
  const c = get(charMap, r.cid as string, freshChar);
  c.swipes++;
  c.swipeWords += wordCount(r.content);
  c.contentChars += r.content?.length ?? 0;
  c.tokensIn += r.ti ?? 0;
  c.tokensOut += r.tout ?? 0;
  foldTokenSamples(c, r);
  c.reasoningMs += reasoningMsOf(r);
  const gen = genDurationMs(r);
  if (gen !== null) {
    c.genTimeMs += gen;
    c.genSamples++;
  }
  if (hasReasoning(r)) {
    c.reasoningGenerations++;
  }
}

/** Fold one swipe (a NON-selected variant) across owner/char/bucket/model. Swipes credit the RE-ROLL
 *  counters; the timeline bucket gets swipe COUNT + gen-time but NOT swipe tokens (esoteric #1). */
function foldSwipe(r: SwipeRow, a: Accums): void {
  const bucket = get(a.bucketMap, statsBucketStart(r.msgCreatedAt), freshBucket);
  const gen = genDurationMs(r);
  a.owner.swipes++;
  a.owner.swipeWords += wordCount(r.content);
  a.owner.contentChars += r.content?.length ?? 0;
  a.owner.tokensIn += r.ti ?? 0;
  a.owner.tokensOut += r.tout ?? 0;
  foldTokenSamples(a.owner, r);
  a.owner.reasoningMs += reasoningMsOf(r);
  bucket.swipes++;
  if (gen !== null) {
    a.owner.genTimeMs += gen;
    a.owner.genSamples++;
    bucket.genTimeMs += gen;
  }
  if (hasReasoning(r)) {
    a.owner.reasoningGenerations++;
  }
  if (r.cid !== null) {
    foldSwipeChar(a.charMap, r);
  }
  const identity = modelIdentity(r.model, r.provider);
  if (identity !== null) {
    const entry = get(a.modelMap, modelMapKey(identity.model, identity.provider), () => ({
      ...identity,
      acc: freshModel(),
    }));
    foldModelGen(entry.acc, r); // swipes carry no cost/cache into the model bucket
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
      const legs = usageLegsOf(r.usageLegs);
      foldSwipe(legs.length === 0 ? r : { ...r, ti: null, tout: null, tokenProvenance: "unrecorded" }, a);
      foldVariantLegs({ ownerId, cid: r.cid, legs, selected: false }, a);
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

/** The accumulators one spend delta lands on: the owner, its timeline bucket, and its model row (none for a
 *  model-less delta — `applyStatsDelta` skips `model_stats` then). */
interface SpendGrains {
  owner: OwnerAccum;
  bucket: BucketAccum;
  model: ModelAccum | null;
}

function addToModel(model: ModelAccum | null, key: keyof ModelAccum, v: number): void {
  if (model !== null) {
    model[key] += v;
  }
}

/** Where each spend key lands — `applyStatsDelta`'s column mapping, one arm per {@link SPEND_DELTA_FIELDS}. */
const SPEND_FOLD: Readonly<Record<SpendDeltaField, (g: SpendGrains, v: number) => void>> = {
  costUsd: (g, v) => {
    g.owner.costUsd += v;
    g.bucket.costUsd += v;
  },
  costSamples: (g, v) => {
    g.owner.costSamples += v;
    g.bucket.costSamples += v;
  },
  modelGenerations: (g, v) => addToModel(g.model, "generations", v),
  modelGenSamples: (g, v) => addToModel(g.model, "genSamples", v),
  modelCostUsd: (g, v) => addToModel(g.model, "costUsd", v),
  modelCostSamples: (g, v) => addToModel(g.model, "costSamples", v),
  modelNotionalCostSamples: (g, v) => addToModel(g.model, "notionalCostSamples", v),
  notionalCostSamples: (g, v) => {
    g.owner.notionalCostSamples += v;
    g.bucket.notionalCostSamples += v;
  },
  tokensIn: (g, v) => {
    g.owner.tokensIn += v;
  },
  tokensInMeasuredSamples: (g, v) => {
    g.owner.tokensInMeasuredSamples += v;
  },
  dailyTokensIn: (g, v) => {
    g.bucket.tokensIn += v;
  },
  dailyTokensInMeasuredSamples: (g, v) => {
    g.bucket.tokensInMeasuredSamples += v;
  },
  modelTokensIn: (g, v) => addToModel(g.model, "tokensIn", v),
  modelTokensInMeasuredSamples: (g, v) => addToModel(g.model, "tokensInMeasuredSamples", v),
  tokensOut: (g, v) => {
    g.owner.tokensOut += v;
  },
  tokensOutMeasuredSamples: (g, v) => {
    g.owner.tokensOutMeasuredSamples += v;
  },
  dailyTokensOut: (g, v) => {
    g.bucket.tokensOut += v;
  },
  dailyTokensOutMeasuredSamples: (g, v) => {
    g.bucket.tokensOutMeasuredSamples += v;
  },
  modelTokensOut: (g, v) => addToModel(g.model, "tokensOut", v),
  modelTokensOutMeasuredSamples: (g, v) => addToModel(g.model, "tokensOutMeasuredSamples", v),
  cacheReadTokens: (g, v) => {
    g.owner.cacheReadTokens += v;
  },
  cacheWriteTokens: (g, v) => {
    g.owner.cacheWriteTokens += v;
  },
  modelCacheReadTokens: (g, v) => addToModel(g.model, "cacheReadTokens", v),
  modelCacheWriteTokens: (g, v) => addToModel(g.model, "cacheWriteTokens", v),
  lastAt: (g, v) => {
    g.owner.lastActivityAt = Math.max(g.owner.lastActivityAt, v);
  },
};

/** Fold one spend delta. The timeline bucket (and the model row) exists even for a zero-valued delta,
 *  because the live upsert writes those rows whatever the increments are. */
function foldSpend(d: StatsDelta, a: Accums): void {
  const identity = modelIdentity(d.model, d.provider);
  const grains: SpendGrains = {
    owner: a.owner,
    bucket: get(a.bucketMap, d.bucketStart, freshBucket),
    model: identity === null ? null : get(a.modelMap, modelMapKey(identity.model, identity.provider), () => ({ ...identity, acc: freshModel() })).acc,
  };
  for (const field of SPEND_DELTA_FIELDS) {
    const v = d[field];
    if (typeof v === "number") {
      SPEND_FOLD[field](grains, v);
    }
  }
}

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

interface CharChatMeta {
  chats: number;
  forkedChats: number;
  firstChatAt: number | null;
  maxChatUpdated: number | null;
}
interface ChatMeta {
  chatByChar: Map<string, CharChatMeta>;
  chatsCreatedByBucket: Map<number, number>;
  library: { characters: number; chats: number; forkedChats: number };
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
  const chatByChar = new Map(chatAgg.map((r) => [r.cid, r]));
  // The bucket is computed in SQL with the same floor `statsBucketStart` applies to a message.
  const chatBuckets = await db.all<{ bucketStart: number; n: number }>(sql`
    SELECT ${calendarBucketStartSql(sql`ch.created_at`)} AS bucketStart, COUNT(DISTINCT ch.id) AS n
    FROM chats ch WHERE ch.id IN (${ownerChatIds(ownerId)}) GROUP BY bucketStart
  `);
  const chatsCreatedByBucket = new Map(chatBuckets.map((r) => [r.bucketStart, r.n]));
  const library = (
    await db.all<{ characters: number; chats: number; forkedChats: number }>(sql`
      SELECT (SELECT COUNT(*) FROM characters WHERE owner_id = ${ownerId}) AS characters,
             (SELECT COUNT(*) FROM (${ownerChatIds(ownerId)})) AS chats,
             (SELECT COUNT(*) FROM chats WHERE parent_chat_id IS NOT NULL
                AND id IN (${ownerChatIds(ownerId)})) AS forkedChats
    `)
  )[0] ?? { characters: 0, chats: 0, forkedChats: 0 };
  return { chatByChar, chatsCreatedByBucket, library };
}

/** Owner extrema: earliest chat created, latest of (last message seen, last chat update). */
function ownerExtrema(owner: OwnerAccum, meta: ChatMeta): void {
  let first: number | null = null;
  for (const m of meta.chatByChar.values()) {
    if (m.firstChatAt !== null && (first === null || m.firstChatAt < first)) {
      first = m.firstChatAt;
    }
    if (m.maxChatUpdated !== null && m.maxChatUpdated > owner.lastActivityAt) {
      owner.lastActivityAt = m.maxChatUpdated;
    }
  }
  owner.firstChatAt = first;
}

/** THE CENSUS POPULATION IS SEATS ∪ AUTHORSHIP (#1147): a character that HOLDS A SEAT in a started room
 *  gets a row even when it never spoke (a greet-less card, an imported cast member, a member added but not
 *  yet prompted) — "seated here, never spoke" is a real library state and its zero-economics row is the
 *  honest answer, not an absent character. The authorship half stays because a character can author canon in
 *  a room it has since LEFT with its seat row dropped by an old write. Sorted so the emitted row order (and
 *  therefore the minted-id order) is a pure function of the canon. */
function censusPopulation(charMap: Map<string, CharAccum>, meta: ChatMeta): string[] {
  return [...new Set([...charMap.keys(), ...meta.chatByChar.keys()])].sort();
}

function buildCharRows(charMap: Map<string, CharAccum>, meta: ChatMeta, now: number): (typeof characterStats.$inferInsert)[] {
  return censusPopulation(charMap, meta).map((characterId) => {
    const c = charMap.get(characterId) ?? freshChar();
    const m = meta.chatByChar.get(characterId);
    const lastActivityAt = Math.max(c.lastMsgAt, m?.maxChatUpdated ?? 0) || null;
    return {
      id: mintTypeId(ID_PREFIX.characterStat),
      characterId: castId<CharacterId>(characterId),
      chats: m?.chats ?? 0,
      userTurns: c.userTurns,
      assistantTurns: c.assistantTurns,
      systemTurns: c.systemTurns,
      swipes: c.swipes,
      userWords: c.userWords,
      assistantWords: c.assistantWords,
      swipeWords: c.swipeWords,
      tokensIn: c.tokensIn,
      tokensOut: c.tokensOut,
      tokensInMeasuredSamples: c.tokensInMeasuredSamples,
      tokensInEstimatedSamples: c.tokensInEstimatedSamples,
      tokensOutMeasuredSamples: c.tokensOutMeasuredSamples,
      tokensOutEstimatedSamples: c.tokensOutEstimatedSamples,
      costUsd: c.costUsd,
      costSamples: c.costSamples,
      notionalCostSamples: c.notionalCostSamples,
      genTimeMs: c.genTimeMs,
      genSamples: c.genSamples,
      reasoningGenerations: c.reasoningGenerations,
      reasoningMs: c.reasoningMs,
      activeIdxSum: c.activeIdxSum,
      variantMessages: c.variantMessages,
      forkedChats: m?.forkedChats ?? 0,
      contentChars: c.contentChars,
      firstChatAt: m?.firstChatAt ?? null,
      lastActivityAt,
      computedAt: now,
    };
  });
}

function buildOwnerRow(ownerId: UserId, owner: OwnerAccum, meta: ChatMeta, now: number): typeof ownerStats.$inferInsert {
  return {
    ownerId,
    characters: meta.library.characters,
    chats: meta.library.chats,
    userTurns: owner.userTurns,
    assistantTurns: owner.assistantTurns,
    systemTurns: owner.systemTurns,
    swipes: owner.swipes,
    userWords: owner.userWords,
    assistantWords: owner.assistantWords,
    swipeWords: owner.swipeWords,
    tokensIn: owner.tokensIn,
    tokensOut: owner.tokensOut,
    tokensInMeasuredSamples: owner.tokensInMeasuredSamples,
    tokensInEstimatedSamples: owner.tokensInEstimatedSamples,
    tokensOutMeasuredSamples: owner.tokensOutMeasuredSamples,
    tokensOutEstimatedSamples: owner.tokensOutEstimatedSamples,
    costUsd: owner.costUsd,
    costSamples: owner.costSamples,
    notionalCostSamples: owner.notionalCostSamples,
    genTimeMs: owner.genTimeMs,
    genSamples: owner.genSamples,
    reasoningGenerations: owner.reasoningGenerations,
    reasoningMs: owner.reasoningMs,
    activeIdxSum: owner.activeIdxSum,
    variantMessages: owner.variantMessages,
    forkedChats: meta.library.forkedChats,
    contentChars: owner.contentChars,
    cacheReadTokens: owner.cacheReadTokens,
    cacheWriteTokens: owner.cacheWriteTokens,
    maxContextTokens: owner.maxContextTokens,
    firstChatAt: owner.firstChatAt,
    lastActivityAt: owner.lastActivityAt || null,
    computedAt: now,
  };
}

function buildBucketRows(ownerId: UserId, bucketMap: Map<number, BucketAccum>, meta: ChatMeta, now: number): (typeof dailyStats.$inferInsert)[] {
  const bucketKeys = new Set([...bucketMap.keys(), ...meta.chatsCreatedByBucket.keys()]);
  return [...bucketKeys].map((bucketStart) => {
    const d = bucketMap.get(bucketStart) ?? freshBucket();
    return {
      id: mintTypeId(ID_PREFIX.dailyStat),
      ownerId,
      bucketStart,
      chatsCreated: meta.chatsCreatedByBucket.get(bucketStart) ?? 0,
      userTurns: d.userTurns,
      assistantTurns: d.assistantTurns,
      systemTurns: d.systemTurns,
      swipes: d.swipes,
      userWords: d.userWords,
      assistantWords: d.assistantWords,
      tokensIn: d.tokensIn,
      tokensOut: d.tokensOut,
      tokensInMeasuredSamples: d.tokensInMeasuredSamples,
      tokensInEstimatedSamples: d.tokensInEstimatedSamples,
      tokensOutMeasuredSamples: d.tokensOutMeasuredSamples,
      tokensOutEstimatedSamples: d.tokensOutEstimatedSamples,
      costUsd: d.costUsd,
      costSamples: d.costSamples,
      notionalCostSamples: d.notionalCostSamples,
      genTimeMs: d.genTimeMs,
      messageDatesApprox: d.approx,
      computedAt: now,
    };
  });
}

function buildModelRows(ownerId: UserId, modelMap: Map<string, ModelEntry>, now: number): (typeof modelStats.$inferInsert)[] {
  return [...modelMap.values()].map(({ model, provider, acc }) => ({
    id: mintTypeId(ID_PREFIX.modelStat),
    ownerId,
    model,
    provider: provider ?? MODEL_PROVIDER_UNKNOWN,
    generations: acc.generations,
    tokensIn: acc.tokensIn,
    tokensOut: acc.tokensOut,
    tokensInMeasuredSamples: acc.tokensInMeasuredSamples,
    tokensInEstimatedSamples: acc.tokensInEstimatedSamples,
    tokensOutMeasuredSamples: acc.tokensOutMeasuredSamples,
    tokensOutEstimatedSamples: acc.tokensOutEstimatedSamples,
    genTimeMs: acc.genTimeMs,
    genSamples: acc.genSamples,
    reasoningGenerations: acc.reasoningGenerations,
    reasoningMs: acc.reasoningMs,
    costUsd: acc.costUsd,
    costSamples: acc.costSamples,
    notionalCostSamples: acc.notionalCostSamples,
    cacheReadTokens: acc.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens,
    computedAt: now,
  }));
}

interface OwnerRollupRows {
  ownerRow: typeof ownerStats.$inferInsert;
  charRows: (typeof characterStats.$inferInsert)[];
  bucketRows: (typeof dailyStats.$inferInsert)[];
  modelRows: (typeof modelStats.$inferInsert)[];
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
  const a: Accums = {
    owner: freshOwner(),
    charMap: new Map<string, CharAccum>(),
    bucketMap: new Map<number, BucketAccum>(),
    modelMap: new Map<string, ModelEntry>(),
  };
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
  const ownedCharacters = new Set((await db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, oid))).map((row) => row.id));
  const rows: OwnerRollupRows = {
    ownerRow: buildOwnerRow(oid, a.owner, meta, now),
    charRows: buildCharRows(a.charMap, meta, now).filter((row) => ownedCharacters.has(row.characterId)),
    bucketRows: buildBucketRows(oid, a.bucketMap, meta, now),
    modelRows: buildModelRows(oid, a.modelMap, now),
  };
  await writeOwner(db, ownerId, rows);
  return {
    charCount: rows.charRows.length,
    bucketCount: rows.bucketRows.length,
    modelCount: rows.modelRows.length,
  };
}
