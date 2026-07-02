// domain/stats/write/rebuild-from-canon — the full RECONCILE: a memory-bounded streaming rebuild of the
// four rollup tables (db/schema/stats.ts) for one owner (or every owner) from canon. The write-path
// SIBLING of apply-delta.ts: since rollups are maintained LIVE on the write path, this is the BACKFILL /
// POST-IMPORT settle / admin DRIFT-REPAIR path (the `reconcile-stats` workload), NOT a user-facing
// recompute. It is the source of truth the drift test (invariant #3) asserts the live deltas match
// byte-for-byte. NOT a service verb — exported standalone via the front door, injected into the workload
// runner. Determinism: the clock is INJECTED (`now`), never `Date.now()` (no-raw-clock).
//
// Design (esoteric #4/#11): keyset-paged streams over messages + their swipe variants (bounded peak
// memory); per-character/per-model/per-day accumulator Maps; ATOMIC per-owner replace-write (ONE db.batch
// of [delete ×4, ...chunked inserts]) so a read never sees a half-rebuilt owner; inserts chunked under the
// libSQL bound-variable cap (@orb/db/kit). Word counts use `@orb/kit/stats-tally.wordCount` (ST's `\b\w+\b`)
// and days use `utcDay` — the SAME primitives the chat delta builders import, so the live delta can't drift
// from this rebuild (that shared-home guarantee is structural, the drift test is the backstop).
//
// ORBWEAVER (D26/D28/D18): content + economics live on `message_variants` (D26 — the slot is pure), so a
// message's primary contribution is its SELECTED variant and its swipes are the NON-selected variants.
// Per-character grain keys on `messages.characterId` directly (D28). Owner-scoping is membership-derived
// (D18 — no chats.ownerId): the owner's chats are those with a character participant the owner owns.
//
// OWNER-ATTRIBUTION (PD-21 CONFIRMED against chat's D18 membership model, 2026-07-01): owner =
// characters.ownerId for assistant economics; the owner's chats by character-participant membership for
// user turns / chat counts (D23: character_stats has no ownerId precisely because owner derives via
// characterId→characters.ownerId). This is EXACT under v1's enforced single-owner-per-chat invariant:
// every roster character is HOST-owned — `startChat`/`addCharacterToChat` gate each characterId through
// the host's owner-scoped card read (foreign == missing), so characters.ownerId ≡ the D19 host the live
// StatsDelta builders attribute to. The multi-owner attribution question re-opens ONLY with the v2
// first-class-agent / member-owned-character roster work (PD-17) — re-decide it there, not here.

import type { BatchStmt, Db } from "@orb/db";
import {
  batchMany,
  characterStats,
  chunkRows,
  dailyStats,
  modelStats,
  ownerStats,
  rowsPerInsert,
} from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { utcDay, wordCount } from "@orb/kit/stats-tally";
import type { SQL } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import type { ReconcileStatsResult } from "../contract/results";

export type { ReconcileStatsResult } from "../contract/results";

const CHUNK = 5000; // rows per streaming page — bounds peak memory on large corpora
const DAY_MS = 86_400_000;
const MIGRATION_GAP_DAYS = 30; // a message >30d after its chat's creation = migrated (createdAt clobbered)
const MIGRATION_GAP_MS = MIGRATION_GAP_DAYS * DAY_MS;
const UNKNOWN_PROVIDER = "(unknown)";
// Per-table column counts for the bound-variable chunker (must track the insert shapes below).
const CHAR_COLS = 24;
const DAILY_COLS = 16;
const MODEL_COLS = 15;

// ── Accumulators (file-local pipeline shapes — not exported, not contract types; §7.4). ──
interface CharAccum {
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
  activeIdxSum: number;
  variantMessages: number;
  contentBytes: number;
  lastMsgAt: number;
}
interface ModelAccum {
  generations: number;
  tokensIn: number;
  tokensOut: number;
  genTimeMs: number;
  genSamples: number;
  reasoningGenerations: number;
  reasoningMs: number;
  costUsd: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
interface DayAccum {
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
  approx: boolean;
}
interface OwnerAccum {
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
  genTimeMs: 0,
  genSamples: 0,
  reasoningGenerations: 0,
  reasoningMs: 0,
  costUsd: 0,
  activeIdxSum: 0,
  variantMessages: 0,
  contentBytes: 0,
  lastMsgAt: 0,
});
const freshModel = (): ModelAccum => ({
  generations: 0,
  tokensIn: 0,
  tokensOut: 0,
  genTimeMs: 0,
  genSamples: 0,
  reasoningGenerations: 0,
  reasoningMs: 0,
  costUsd: 0,
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
  genTimeMs: 0,
  costUsd: 0,
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
  genTimeMs: 0,
  genSamples: 0,
  reasoningGenerations: 0,
  reasoningMs: 0,
  costUsd: 0,
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
  if (!v) {
    v = mk();
    map.set(key, v);
  }
  return v;
}

// The generation-bearing fields both streams expose (the selected variant + each swipe variant).
interface GenRow {
  ti: number | null;
  tout: number | null;
  gs: number | null;
  gf: number | null;
  reasoning: string | null;
  reasoningDur: number | null;
}

/** metadata.reasoning_duration as non-negative rounded ms, or 0 when absent/invalid. */
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
 *  that owns a character. Aborts cooperatively between owners via `signal`. See the owner-attribution note (header). */
export async function reconcileStats(db: Db, opts: ReconcileOpts): Promise<ReconcileStatsResult> {
  const owners = opts.ownerId
    ? [opts.ownerId]
    : (
        await db.all<{ ownerId: string }>(sql`SELECT DISTINCT owner_id AS ownerId FROM characters`)
      ).map((r) => r.ownerId);

  const now = opts.now();
  let totalChars = 0;
  let totalDays = 0;
  let totalModels = 0;
  for (const ownerId of owners) {
    opts.signal?.throwIfAborted();
    // biome-ignore lint/performance/noAwaitInLoops: per-owner rebuilds are atomic + sequential by design — each per-owner replace must commit before the next to keep peak memory + the batch bounded.
    const built = await computeOwner(db, ownerId, now);
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

// The owner's chats (membership — D18): chats with a character participant the owner owns. The single
// owner-scoping subquery reused by every per-owner scan below.
function ownerChatIds(ownerId: string): SQL {
  return sql`
    SELECT DISTINCT cp.chat_id FROM chat_participants cp
    JOIN characters c ON c.id = cp.character_id
    WHERE c.owner_id = ${ownerId} AND cp.kind = 'character'
  `;
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
  owner.costUsd += r.cost ?? 0;
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
  day.costUsd += r.cost ?? 0;
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

/** Per-character grain (assistant only — D26 slot attribution; system/user carry no characterId). */
function foldMessageChar(charMap: Map<string, CharAccum>, r: MessageRow): void {
  const c = get(charMap, r.cid as string, freshChar);
  c.assistantTurns++;
  c.assistantWords += wordCount(r.content);
  c.contentBytes += r.content?.length ?? 0;
  c.tokensIn += r.ti ?? 0;
  c.tokensOut += r.tout ?? 0;
  c.costUsd += r.cost ?? 0;
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
    entry.acc.cacheReadTokens += r.cacheR ?? 0;
    entry.acc.cacheWriteTokens += r.cacheW ?? 0;
  }
}

/** Stream the owner's messages (keyset-paged on m.id), folding each message's SELECTED variant. */
async function scanMessages(db: Db, ownerId: string, a: Accums): Promise<void> {
  let lastId = "";
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: keyset pagination is inherently sequential — each page's last id seeds the next WHERE.
    const rows = await db.all<MessageRow>(sql`
      SELECT m.id AS mid, m.character_id AS cid, m.role AS role, m.created_at AS createdAt,
             ch.created_at AS chatCreatedAt, v.content AS content,
             v.tokens_in AS ti, v.tokens_out AS tout, v.gen_started_at AS gs, v.gen_finished_at AS gf,
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
    // biome-ignore lint/performance/noAwaitInLoops: keyset pagination is inherently sequential.
    const rows = await db.all<SwipeRow>(sql`
      SELECT mv.id AS svid, m.character_id AS cid, m.created_at AS msgCreatedAt, mv.content AS content,
             mv.tokens_in AS ti, mv.tokens_out AS tout, mv.gen_started_at AS gs, mv.gen_finished_at AS gf,
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
 *  totals. All membership-scoped to the owner's chats / owned characters (D18/D23). */
async function loadChatMeta(db: Db, ownerId: string): Promise<ChatMeta> {
  const chatAgg = await db.all<{ cid: string } & CharChatMeta>(sql`
    SELECT cp.character_id AS cid, COUNT(DISTINCT cp.chat_id) AS chats,
           SUM(CASE WHEN ch.parent_chat_id IS NOT NULL THEN 1 ELSE 0 END) AS forkedChats,
           MIN(ch.created_at) AS firstChatAt, MAX(ch.updated_at) AS maxChatUpdated
    FROM chat_participants cp
    JOIN chats ch ON ch.id = cp.chat_id
    JOIN characters c ON c.id = cp.character_id
    WHERE c.owner_id = ${ownerId} AND cp.kind = 'character'
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

function buildCharRows(
  charMap: Map<string, CharAccum>,
  meta: ChatMeta,
  now: number,
): (typeof characterStats.$inferInsert)[] {
  return [...charMap.entries()].map(([characterId, c]) => {
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
      costUsd: c.costUsd,
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

function buildOwnerRow(
  ownerId: UserId,
  owner: OwnerAccum,
  meta: ChatMeta,
  now: number,
): typeof ownerStats.$inferInsert {
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
    costUsd: owner.costUsd,
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

function buildDayRows(
  ownerId: UserId,
  dayMap: Map<string, DayAccum>,
  meta: ChatMeta,
  now: number,
): (typeof dailyStats.$inferInsert)[] {
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
      costUsd: d.costUsd,
      genTimeMs: d.genTimeMs,
      messageDatesApprox: d.approx,
      computedAt: now,
    };
  });
}

function buildModelRows(
  ownerId: UserId,
  modelMap: Map<string, ModelEntry>,
  now: number,
): (typeof modelStats.$inferInsert)[] {
  return [...modelMap.values()].map(({ model, provider, acc }) => ({
    id: mintTypeId(ID_PREFIX.modelStat),
    ownerId,
    model,
    provider: provider ?? UNKNOWN_PROVIDER,
    generations: acc.generations,
    tokensIn: acc.tokensIn,
    tokensOut: acc.tokensOut,
    genTimeMs: acc.genTimeMs,
    genSamples: acc.genSamples,
    reasoningGenerations: acc.reasoningGenerations,
    reasoningMs: acc.reasoningMs,
    costUsd: acc.costUsd,
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
    db
      .delete(characterStats)
      .where(
        sql`${characterStats.characterId} IN (SELECT id FROM characters WHERE owner_id = ${ownerId})`,
      ),
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

async function computeOwner(
  db: Db,
  ownerId: string,
  now: number,
): Promise<{ charCount: number; dayCount: number; modelCount: number }> {
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
