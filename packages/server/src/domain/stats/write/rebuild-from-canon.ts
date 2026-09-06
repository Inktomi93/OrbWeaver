// Full RECONCILE: a memory-bounded streaming rebuild of the four rollup tables for one owner (or every
// owner) from canon — the backfill/post-import/drift-repair path (rollups are maintained live elsewhere).
// Keyset-paged streams over messages + swipe variants (bounded peak memory); per-character/model/day
// accumulator Maps; atomic per-owner replace-write (one db.batch) so a read never sees a half-rebuilt owner.
// Owner-scoping is membership-derived: the owner's chats are those with a character participant they own.

import type { TokenProvenance } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characterStats, dailyStats, modelStats, ownerStats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, chunkRows, rowsPerInsert } from "@orb/db/kit";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { utcDay, wordCount } from "@orb/kit/stats-tally";
import { eq, sql } from "drizzle-orm";
import type { ReconcileStatsResult } from "../contract/results.ts";
import { ownerChatIds } from "../substrate/owner-chat-scope.ts";

export type { ReconcileStatsResult } from "../contract/results.ts";

const CHUNK = 5000; // rows per streaming page — bounds peak memory on large corpora
const DAY_MS = 86_400_000;
const MIGRATION_GAP_DAYS = 30; // a message >30d after its chat's creation = migrated (createdAt clobbered)
const MIGRATION_GAP_MS = MIGRATION_GAP_DAYS * DAY_MS;
const UNKNOWN_PROVIDER = "(unknown)";
// Per-table column counts for the bound-variable chunker — must track the insert shapes below.
const CHAR_COLS = 29;
const DAILY_COLS = 21;
const MODEL_COLS = 20;

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
  activeIdxSum: number;
  variantMessages: number;
  contentBytes: number;
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
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
interface DayAccum extends TokenSampleAccum {
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
  activeIdxSum: number;
  variantMessages: number;
  contentBytes: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  maxContextTokens: number | null;
  firstChatAt: number | null;
  lastActivityAt: number;
}
interface ModelEntry {
  model: string;
  provider: string | null;
  acc: ModelAccum;
}
/** The per-owner accumulator bundle threaded through the fold/scan helpers (one param, not four). */
interface Accums {
  owner: OwnerAccum;
  charMap: Map<string, CharAccum>;
  dayMap: Map<string, DayAccum>;
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
  activeIdxSum: 0,
  variantMessages: 0,
  contentBytes: 0,
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
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});
const freshDay = (): DayAccum => ({
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
  activeIdxSum: 0,
  variantMessages: 0,
  contentBytes: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  maxContextTokens: null,
  firstChatAt: null,
  lastActivityAt: 0,
});

function get<V>(map: Map<string, V>, key: string, mk: () => V): V {
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
  return `${model} ${provider ?? UNKNOWN_PROVIDER}`;
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
      : (await db.all<{ ownerId: string }>(sql`SELECT DISTINCT owner_id AS ownerId FROM characters`)).map((r) => r.ownerId);

  const now = opts.now();
  let totalChars = 0;
  let totalDays = 0;
  let totalModels = 0;
  for (const ownerId of owners) {
    let built: { charCount: number; dayCount: number; modelCount: number };
    for (;;) {
      opts.signal?.throwIfAborted();
      const before = await ownerCanonSnapshot(db, ownerId);
      built = await computeOwner(db, ownerId, now);
      const after = await ownerCanonSnapshot(db, ownerId);
      if (before === after) {
        break;
      }
    }
    totalChars += built.charCount;
    totalDays += built.dayCount;
    totalModels += built.modelCount;
  }
  return {
    owners: owners.length,
    characters: totalChars,
    days: totalDays,
    models: totalModels,
    computedAt: now,
  };
}

// The owner's chats (membership, husk-excluding) is `substrate/owner-chat-scope.ts` — ONE home, shared with
// the on-read scans (#1477). It is reused by every per-owner scan below (the message stream, the daily
// chats-created histogram, the library totals); `loadChatMeta`'s per-character aggregate needs its own join
// shape (it GROUPs by participant) and carries the same arm inline.
//
// An agent-authored assistant row (characterId NULL) folds to the host owner + skips character_stats.
// FLAG[PD-17]: a character-less agent-only room is un-constructable in v1, so that case is deferred, not
// built.

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
}

/** Owner-grain economics from a message's SELECTED variant (tokens/cost/cache/ctx/bytes/gen/reasoning). */
function foldOwnerMessage(owner: OwnerAccum, day: DayAccum, r: MessageRow): void {
  const bytes = r.content?.length ?? 0;
  owner.contentBytes += bytes;
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
  day.tokensIn += r.ti ?? 0;
  day.tokensOut += r.tout ?? 0;
  foldTokenSamples(day, r);
  day.costUsd += r.cost ?? 0;
  day.costSamples += Number(r.cost !== null);
  const gen = genDurationMs(r);
  if (gen !== null) {
    owner.genTimeMs += gen;
    owner.genSamples++;
    day.genTimeMs += gen;
  }
}

/** Turn/word counts split on role (ST is_user binary: userWords vs non-user assistant+system words). */
function foldRoleCounts(owner: OwnerAccum, day: DayAccum, r: MessageRow): void {
  const words = wordCount(r.content);
  if (r.role === "user") {
    owner.userTurns++;
    owner.userWords += words;
    day.userTurns++;
    day.userWords += words;
    return;
  }
  owner.assistantWords += words;
  day.assistantWords += words;
  if (r.role === "system") {
    owner.systemTurns++;
    day.systemTurns++;
  } else {
    owner.assistantTurns++;
    day.assistantTurns++;
  }
}

/** Per-character grain (assistant only; system/user carry no characterId). */
function foldMessageChar(charMap: Map<string, CharAccum>, r: MessageRow): void {
  const c = get(charMap, r.cid as string, freshChar);
  c.assistantTurns++;
  c.assistantWords += wordCount(r.content);
  c.contentBytes += r.content?.length ?? 0;
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

/** Fold one message (its SELECTED variant — the kept take) across owner/char/day/model accumulators. */
function foldMessage(r: MessageRow, a: Accums): void {
  const day = get(a.dayMap, utcDay(r.createdAt), freshDay);
  if (r.createdAt - r.chatCreatedAt > MIGRATION_GAP_MS) {
    day.approx = true;
  }
  foldOwnerMessage(a.owner, day, r);
  foldRoleCounts(a.owner, day, r);
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
  }
  if (r.role === "assistant" && r.model !== null) {
    const entry = get(a.modelMap, modelMapKey(r.model, r.provider), () => ({
      model: r.model as string,
      provider: r.provider,
      acc: freshModel(),
    }));
    foldModelGen(entry.acc, r);
    entry.acc.costUsd += r.cost ?? 0;
    entry.acc.costSamples += r.cost === null ? 0 : 1;
    entry.acc.cacheReadTokens += r.cacheR ?? 0;
    entry.acc.cacheWriteTokens += r.cacheW ?? 0;
  }
}

/** Stream the owner's messages (keyset-paged on m.id), folding each message's SELECTED variant. */
async function scanMessages(db: Db, ownerId: string, a: Accums): Promise<void> {
  let lastId = "";
  for (;;) {
    const rows = await db.all<MessageRow>(sql`
      SELECT m.id AS mid, m.character_id AS cid, m.role AS role, m.created_at AS createdAt,
             ch.created_at AS chatCreatedAt, v.content AS content,
             v.tokens_in AS ti, v.tokens_out AS tout, v.token_provenance AS tokenProvenance,
             v.gen_started_at AS gs, v.gen_finished_at AS gf,
             v.model AS model, v.provider AS provider, v.reasoning AS reasoning,
             json_extract(v.metadata, '$.reasoning_duration') AS reasoningDur,
             v.cost_usd AS cost, v.cache_read_tokens AS cacheR, v.cache_write_tokens AS cacheW,
             v.context_window AS ctx, v.idx AS selectedIdx,
             (SELECT COUNT(*) FROM message_variants vv WHERE vv.message_id = m.id) AS variantCount
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
      foldMessage(r, a);
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
}

/** Per-character swipe fold (assistant re-rolls). */
function foldSwipeChar(charMap: Map<string, CharAccum>, r: SwipeRow): void {
  const c = get(charMap, r.cid as string, freshChar);
  c.swipes++;
  c.swipeWords += wordCount(r.content);
  c.contentBytes += r.content?.length ?? 0;
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

/** Fold one swipe (a NON-selected variant) across owner/char/day/model. Swipes credit the RE-ROLL
 *  counters; daily gets swipe COUNT + gen-time but NOT swipe tokens (esoteric #1). */
function foldSwipe(r: SwipeRow, a: Accums): void {
  const day = get(a.dayMap, utcDay(r.msgCreatedAt), freshDay);
  const gen = genDurationMs(r);
  a.owner.swipes++;
  a.owner.swipeWords += wordCount(r.content);
  a.owner.contentBytes += r.content?.length ?? 0;
  a.owner.tokensIn += r.ti ?? 0;
  a.owner.tokensOut += r.tout ?? 0;
  foldTokenSamples(a.owner, r);
  a.owner.reasoningMs += reasoningMsOf(r);
  day.swipes++;
  if (gen !== null) {
    a.owner.genTimeMs += gen;
    a.owner.genSamples++;
    day.genTimeMs += gen;
  }
  if (hasReasoning(r)) {
    a.owner.reasoningGenerations++;
  }
  if (r.cid !== null) {
    foldSwipeChar(a.charMap, r);
  }
  if (r.model !== null) {
    const entry = get(a.modelMap, modelMapKey(r.model, r.provider), () => ({
      model: r.model as string,
      provider: r.provider,
      acc: freshModel(),
    }));
    foldModelGen(entry.acc, r); // swipes carry no cost/cache into the model bucket
  }
}

/** Stream the owner's swipe variants (the NON-selected variants), keyset-paged on mv.id. */
async function scanSwipes(db: Db, ownerId: string, a: Accums): Promise<void> {
  let lastId = "";
  for (;;) {
    const rows = await db.all<SwipeRow>(sql`
      SELECT mv.id AS svid, m.character_id AS cid, m.created_at AS msgCreatedAt, mv.content AS content,
             mv.tokens_in AS ti, mv.tokens_out AS tout, mv.token_provenance AS tokenProvenance,
             mv.gen_started_at AS gs, mv.gen_finished_at AS gf,
             mv.model AS model, mv.provider AS provider, mv.reasoning AS reasoning,
             json_extract(mv.metadata, '$.reasoning_duration') AS reasoningDur
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
      foldSwipe(r, a);
    }
    lastId = rows.at(-1)?.svid ?? lastId;
    if (rows.length < CHUNK) {
      break;
    }
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
  chatsCreatedByDay: Map<string, number>;
  library: { characters: number; chats: number; forkedChats: number };
}

/** The chat-level aggregates: per-character chat counts + first/last, daily chatsCreated, owner library
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
    WHERE c.owner_id = ${ownerId} AND cp.kind = 'character' AND ch.started_at IS NOT NULL
    GROUP BY cp.character_id
  `);
  const chatByChar = new Map(chatAgg.map((r) => [r.cid, r]));
  const chatDays = await db.all<{ day: string; n: number }>(sql`
    SELECT strftime('%Y-%m-%d', ch.created_at / 1000, 'unixepoch') AS day, COUNT(DISTINCT ch.id) AS n
    FROM chats ch WHERE ch.id IN (${ownerChatIds(ownerId)}) GROUP BY day
  `);
  const chatsCreatedByDay = new Map(chatDays.map((r) => [r.day, r.n]));
  const library = (
    await db.all<{ characters: number; chats: number; forkedChats: number }>(sql`
      SELECT (SELECT COUNT(*) FROM characters WHERE owner_id = ${ownerId}) AS characters,
             (SELECT COUNT(*) FROM (${ownerChatIds(ownerId)})) AS chats,
             (SELECT COUNT(*) FROM chats WHERE parent_chat_id IS NOT NULL
                AND id IN (${ownerChatIds(ownerId)})) AS forkedChats
    `)
  )[0] ?? { characters: 0, chats: 0, forkedChats: 0 };
  return { chatByChar, chatsCreatedByDay, library };
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
      genTimeMs: c.genTimeMs,
      genSamples: c.genSamples,
      reasoningGenerations: c.reasoningGenerations,
      reasoningMs: c.reasoningMs,
      activeIdxSum: c.activeIdxSum,
      variantMessages: c.variantMessages,
      forkedChats: m?.forkedChats ?? 0,
      contentBytes: c.contentBytes,
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
    genTimeMs: owner.genTimeMs,
    genSamples: owner.genSamples,
    reasoningGenerations: owner.reasoningGenerations,
    reasoningMs: owner.reasoningMs,
    activeIdxSum: owner.activeIdxSum,
    variantMessages: owner.variantMessages,
    forkedChats: meta.library.forkedChats,
    contentBytes: owner.contentBytes,
    cacheReadTokens: owner.cacheReadTokens,
    cacheWriteTokens: owner.cacheWriteTokens,
    maxContextTokens: owner.maxContextTokens,
    firstChatAt: owner.firstChatAt,
    lastActivityAt: owner.lastActivityAt || null,
    computedAt: now,
  };
}

function buildDayRows(ownerId: UserId, dayMap: Map<string, DayAccum>, meta: ChatMeta, now: number): (typeof dailyStats.$inferInsert)[] {
  const dayKeys = new Set([...dayMap.keys(), ...meta.chatsCreatedByDay.keys()]);
  return [...dayKeys].map((day) => {
    const d = dayMap.get(day) ?? freshDay();
    return {
      id: mintTypeId(ID_PREFIX.dailyStat),
      ownerId,
      day,
      chatsCreated: meta.chatsCreatedByDay.get(day) ?? 0,
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
    provider: provider ?? UNKNOWN_PROVIDER,
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
    cacheReadTokens: acc.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens,
    computedAt: now,
  }));
}

interface OwnerRollupRows {
  ownerRow: typeof ownerStats.$inferInsert;
  charRows: (typeof characterStats.$inferInsert)[];
  dayRows: (typeof dailyStats.$inferInsert)[];
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
  for (const chunk of chunkRows(rows.dayRows, rowsPerInsert(DAILY_COLS))) {
    stmts.push(db.insert(dailyStats).values(chunk));
  }
  for (const chunk of chunkRows(rows.modelRows, rowsPerInsert(MODEL_COLS))) {
    stmts.push(db.insert(modelStats).values(chunk));
  }
  await db.batch(batchMany(stmts));
}

async function computeOwner(db: Db, ownerId: string, now: number): Promise<{ charCount: number; dayCount: number; modelCount: number }> {
  const a: Accums = {
    owner: freshOwner(),
    charMap: new Map<string, CharAccum>(),
    dayMap: new Map<string, DayAccum>(),
    modelMap: new Map<string, ModelEntry>(),
  };
  await scanMessages(db, ownerId, a);
  await scanSwipes(db, ownerId, a);
  const meta = await loadChatMeta(db, ownerId);
  ownerExtrema(a.owner, meta);

  const oid = castId<UserId>(ownerId);
  const rows: OwnerRollupRows = {
    ownerRow: buildOwnerRow(oid, a.owner, meta, now),
    charRows: buildCharRows(a.charMap, meta, now),
    dayRows: buildDayRows(oid, a.dayMap, meta, now),
    modelRows: buildModelRows(oid, a.modelMap, now),
  };
  await writeOwner(db, ownerId, rows);
  return {
    charCount: rows.charRows.length,
    dayCount: rows.dayRows.length,
    modelCount: rows.modelRows.length,
  };
}
