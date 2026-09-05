// The read side of the four rollup tables: thin projections of the rows maintained live on the write path,
// plus read-derived rates so the stored columns stay additively mergeable. The rollups are always fresh —
// there is no "compute now". The only on-read work is TTFT/gen latency percentiles, which can't be
// `+=`-maintained.
//
// character_stats has no ownerId, so per-owner character reads JOIN `characters` and filter on
// `characters.ownerId`; the name comes off the flat `characters.name`. personaUsage is the live definition
// (anchor persona OR a participant's active persona).

import { STATS_LIST_MAX_LIMIT } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { characterStats, characters, dailyStats, modelStats, ownerStats } from "@orb/db";
import { escapeLikeTerm } from "@orb/db/kit";
import type { CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { LeaderboardOpts, PersonaUsageOpts, TimeseriesOpts } from "../contract/params.ts";
import type {
  CharacterStatsView,
  DailyPoint,
  LeaderboardPage,
  ModelStatRow,
  OwnerStatsView,
  PersonaUsageRow,
  StatsFreshness,
  TemporalStats,
  WrappedSummary,
} from "../contract/views.ts";
import { aggregateTokenProvenance, cacheHitRate, deriveExtra, reasoningRate, recordedCost, recordedTokens, throughputTps } from "../substrate/rates.ts";
import { modelLatencyKey, readLatency, readModelLatencies } from "./latency.ts";

// The ceiling is the shared `STATS_LIST_MAX_LIMIT` (`@orb/contracts/stats` — the transport `.max()`
// references the same value); the `Math.min` is the DoS backstop for internal callers.
const DEFAULT_LIMIT = 50;
const UNKNOWN_PROVIDER = "(unknown)";
const DAY_MS = 86_400_000;

export async function readOverview(db: Db, ownerId: UserId): Promise<OwnerStatsView | null> {
  const row = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
  if (!row) {
    return null;
  }
  // Latency percentiles are computed on read (the stored rollup carries none).
  const latency = await readLatency(db, ownerId, { kind: "owner" });
  return {
    characters: row.characters,
    chats: row.chats,
    userTurns: row.userTurns,
    assistantTurns: row.assistantTurns,
    systemTurns: row.systemTurns,
    swipes: row.swipes,
    userWords: row.userWords,
    assistantWords: row.assistantWords,
    swipeWords: row.swipeWords,
    tokensIn: recordedTokens(row.tokensIn, row.tokensInMeasuredSamples, row.tokensInEstimatedSamples),
    tokensOut: recordedTokens(row.tokensOut, row.tokensOutMeasuredSamples, row.tokensOutEstimatedSamples),
    tokensInProvenance: aggregateTokenProvenance(row.tokensInMeasuredSamples, row.tokensInEstimatedSamples),
    tokensOutProvenance: aggregateTokenProvenance(row.tokensOutMeasuredSamples, row.tokensOutEstimatedSamples),
    totalGenTimeMs: row.genTimeMs,
    ...latency,
    reasoningRate: reasoningRate(row.reasoningGenerations, row.assistantTurns + row.swipes),
    contentBytes: row.contentBytes,
    firstChatAt: row.firstChatAt,
    lastActivityAt: row.lastActivityAt,
    computedAt: row.computedAt,
    ...deriveExtra({ ...row, totalGenTimeMs: row.genTimeMs }),
  };
}

export async function readCharacter(db: Db, ownerId: UserId, characterId: CharacterId): Promise<CharacterStatsView | null> {
  // character_stats has no ownerId — scope via JOIN characters on the owner; name off the flat row.
  const row = (
    await db
      .select({ cs: characterStats, name: characters.name })
      .from(characterStats)
      .innerJoin(characters, eq(characters.id, characterStats.characterId))
      .where(and(eq(characters.ownerId, ownerId), eq(characterStats.characterId, characterId)))
      .limit(1)
  )[0];
  if (!row) {
    return null;
  }
  const c = row.cs;
  const latency = await readLatency(db, ownerId, { kind: "character", characterId: c.characterId });
  return {
    characterId: c.characterId,
    name: row.name,
    characters: 1,
    chats: c.chats,
    userTurns: c.userTurns,
    assistantTurns: c.assistantTurns,
    systemTurns: c.systemTurns,
    swipes: c.swipes,
    userWords: c.userWords,
    assistantWords: c.assistantWords,
    swipeWords: c.swipeWords,
    tokensIn: recordedTokens(c.tokensIn, c.tokensInMeasuredSamples, c.tokensInEstimatedSamples),
    tokensOut: recordedTokens(c.tokensOut, c.tokensOutMeasuredSamples, c.tokensOutEstimatedSamples),
    tokensInProvenance: aggregateTokenProvenance(c.tokensInMeasuredSamples, c.tokensInEstimatedSamples),
    tokensOutProvenance: aggregateTokenProvenance(c.tokensOutMeasuredSamples, c.tokensOutEstimatedSamples),
    totalGenTimeMs: c.genTimeMs,
    ...latency,
    reasoningRate: reasoningRate(c.reasoningGenerations, c.assistantTurns + c.swipes),
    contentBytes: c.contentBytes,
    firstChatAt: c.firstChatAt,
    lastActivityAt: c.lastActivityAt,
    computedAt: c.computedAt,
    // character_stats carries no cache/context columns (owner+model grain only) → 0/null.
    ...deriveExtra({
      reasoningMs: c.reasoningMs,
      costUsd: c.costUsd,
      costSamples: c.costSamples,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      forkedChats: c.forkedChats,
      variantMessages: c.variantMessages,
      maxContextTokens: null,
      tokensIn: c.tokensIn,
      tokensOut: c.tokensOut,
      totalGenTimeMs: c.genTimeMs,
      activeIdxSum: c.activeIdxSum,
      assistantTurns: c.assistantTurns,
      assistantWords: c.assistantWords,
      swipes: c.swipes,
    }),
  };
}

export async function readLeaderboard(db: Db, ownerId: UserId, opts: LeaderboardOpts = {}): Promise<LeaderboardPage> {
  const sort = opts.sort ?? "assistantTurns";
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, STATS_LIST_MAX_LIMIT);
  // Mapped Record — a new LeaderboardSort member is a `tsc` error if its arm is missing (exhaustive-dispatch).
  const sortCols = {
    assistantTurns: characterStats.assistantTurns,
    totalGenTimeMs: characterStats.genTimeMs,
    swipes: characterStats.swipes,
    lastActivityAt: characterStats.lastActivityAt,
  } as const;
  const col = sortCols[sort];
  // The LIST-pane name search (the same predicate narrows the page AND the census below, so a searched
  // band reads an honest "N of M matches"). Wildcards in the term are escaped so a name with `%`/`_`
  // matches literally; the comparison is lowered on both sides for a case-insensitive match on unicode
  // names SQLite's ASCII-only LIKE would miss. Empty/whitespace ⇒ no predicate (the whole population).
  const needle = (opts.search ?? "").trim();
  const pattern = needle === "" ? null : `%${escapeLikeTerm(needle.toLowerCase())}%`;
  const nameMatch = pattern === null ? undefined : sql`lower(${characters.name}) LIKE ${pattern} ESCAPE '\\'`;
  const rowsWhere = nameMatch === undefined ? eq(characters.ownerId, ownerId) : and(eq(characters.ownerId, ownerId), nameMatch);
  const rows = await db
    .select({ cs: characterStats, name: characters.name })
    .from(characterStats)
    .innerJoin(characters, eq(characters.id, characterStats.characterId))
    .where(rowsWhere)
    .orderBy(desc(col))
    .limit(limit);
  // The RANKED population, not the library: the same JOIN + owner predicate (and the same optional name
  // filter) as the page above, uncapped. Without it a consumer can only print `rows.length`, which
  // silently becomes the cap (D: "ANALYTICS 50"); under a search it becomes the MATCH count.
  const searchFilter = pattern === null ? sql`` : sql` AND lower(c.name) LIKE ${pattern} ESCAPE '\\'`;
  const total =
    (
      await db.all<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM character_stats cs
    JOIN characters c ON c.id = cs.character_id
    WHERE c.owner_id = ${ownerId}${searchFilter}
  `)
    )[0]?.n ?? 0;
  return {
    total: Number(total),
    rows: rows.map(({ cs, name }) => ({
      characterId: cs.characterId,
      name,
      chats: cs.chats,
      userTurns: cs.userTurns,
      assistantTurns: cs.assistantTurns,
      swipes: cs.swipes,
      tokensOut: recordedTokens(cs.tokensOut, cs.tokensOutMeasuredSamples, cs.tokensOutEstimatedSamples),
      tokensOutProvenance: aggregateTokenProvenance(cs.tokensOutMeasuredSamples, cs.tokensOutEstimatedSamples),
      totalGenTimeMs: cs.genTimeMs,
      reasoningRate: reasoningRate(cs.reasoningGenerations, cs.assistantTurns + cs.swipes),
      firstChatAt: cs.firstChatAt,
      lastActivityAt: cs.lastActivityAt,
    })),
  };
}

export async function readTimeseries(db: Db, ownerId: UserId, opts: TimeseriesOpts = {}): Promise<DailyPoint[]> {
  const where = [eq(dailyStats.ownerId, ownerId)];
  if (opts.from !== undefined && opts.from !== "") {
    where.push(gte(dailyStats.day, opts.from));
  }
  if (opts.to !== undefined && opts.to !== "") {
    where.push(lte(dailyStats.day, opts.to));
  }
  const rows = await db
    .select()
    .from(dailyStats)
    .where(and(...where))
    .orderBy(dailyStats.day);
  return rows.map((r) => ({
    day: r.day,
    chatsCreated: r.chatsCreated,
    userTurns: r.userTurns,
    assistantTurns: r.assistantTurns,
    swipes: r.swipes,
    tokensIn: recordedTokens(r.tokensIn, r.tokensInMeasuredSamples, r.tokensInEstimatedSamples),
    tokensOut: recordedTokens(r.tokensOut, r.tokensOutMeasuredSamples, r.tokensOutEstimatedSamples),
    tokensInProvenance: aggregateTokenProvenance(r.tokensInMeasuredSamples, r.tokensInEstimatedSamples),
    tokensOutProvenance: aggregateTokenProvenance(r.tokensOutMeasuredSamples, r.tokensOutEstimatedSamples),
    genTimeMs: r.genTimeMs,
    messageDatesApprox: r.messageDatesApprox,
  }));
}

export async function readByModel(db: Db, ownerId: UserId, opts: { limit?: number | undefined } = {}): Promise<ModelStatRow[]> {
  const rows = await db
    .select()
    .from(modelStats)
    .where(eq(modelStats.ownerId, ownerId))
    .orderBy(desc(modelStats.generations))
    .limit(Math.min(opts.limit ?? DEFAULT_LIMIT, STATS_LIST_MAX_LIMIT));
  // Distinct-characters-per-model ("reach") — the rollup is character-less, so one owner-scoped GROUP BY
  // over assistant selected variants, keyed by (model, provider).
  const reachRows = await db.all<{ model: string; provider: string | null; chars: number }>(sql`
    SELECT v.model AS model, v.provider AS provider, COUNT(DISTINCT m.character_id) AS chars
    FROM messages m
    JOIN characters c ON c.id = m.character_id
    JOIN message_variants v ON v.id = m.selected_variant_id
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant' AND v.model IS NOT NULL
    GROUP BY v.model, v.provider
  `);
  // Plain Record (not a Map — persistence holds no in-memory state; this is a query-local lookup).
  const reach: Record<string, number> = {};
  for (const r of reachRows) {
    reach[modelLatencyKey(r.model, r.provider ?? UNKNOWN_PROVIDER)] = r.chars;
  }
  const latencies = await readModelLatencies(db, ownerId);
  const noLatency = {
    avgGenMs: null,
    avgTtftMs: null,
    p50TtftMs: null,
    p90TtftMs: null,
  } as const;
  return rows.map((r): ModelStatRow => {
    const key = modelLatencyKey(r.model, r.provider);
    const latency = latencies.get(key) ?? noLatency;
    return {
      model: r.model,
      provider: r.provider,
      generations: r.generations,
      charactersUsedWith: reach[key] ?? 0,
      tokensIn: recordedTokens(r.tokensIn, r.tokensInMeasuredSamples, r.tokensInEstimatedSamples),
      tokensOut: recordedTokens(r.tokensOut, r.tokensOutMeasuredSamples, r.tokensOutEstimatedSamples),
      tokensInProvenance: aggregateTokenProvenance(r.tokensInMeasuredSamples, r.tokensInEstimatedSamples),
      tokensOutProvenance: aggregateTokenProvenance(r.tokensOutMeasuredSamples, r.tokensOutEstimatedSamples),
      totalGenTimeMs: r.genTimeMs,
      avgGenMs: latency.avgGenMs,
      avgTtftMs: latency.avgTtftMs,
      p50TtftMs: latency.p50TtftMs,
      p90TtftMs: latency.p90TtftMs,
      reasoningRate: reasoningRate(r.reasoningGenerations, r.generations),
      throughputTps: throughputTps(r.tokensOut, r.genTimeMs),
      costUsd: recordedCost(r.costUsd, r.costSamples),
      reasoningMs: r.reasoningMs,
      cacheHitRate: cacheHitRate(r.cacheReadTokens, r.cacheWriteTokens, r.tokensIn),
    };
  });
}

export async function readFreshness(db: Db, ownerId: UserId): Promise<StatsFreshness> {
  const o = (await db.select({ computedAt: ownerStats.computedAt }).from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
  if (!o) {
    return { computedAt: null, stale: false, hasData: false };
  }
  // Live maintenance: owner_stats is upserted on every canon write → always current, never stale.
  return { computedAt: o.computedAt, stale: false, hasData: true };
}

/** Per-persona usage. A persona is "used" by a chat when it's the chat's anchor persona or a participant's
 *  active persona. Served live (a cheap GROUP BY) so a just-created persona shows immediately. The two
 *  usage sources are union-deduped to a (persona, chat) set so messages join once.
 *
 *  `opts.characterId` narrows the CHAT SET to the chats that character takes part in — the CONTEXT panel's
 *  drilled state, which used to render these LIBRARY numbers under the drilled character's face. The narrow
 *  rides `persona_chats` (both usage arms at once) rather than the outer WHERE, so a persona with no chats
 *  WITH that character still appears at zero rather than vanishing from the roster. */
export async function readPersonaUsage(db: Db, ownerId: UserId, opts: PersonaUsageOpts = {}): Promise<PersonaUsageRow[]> {
  const characterId = opts.characterId;
  // Ownership is NOT delegated to this predicate — `personas.owner_id` already scopes every row, and the
  // chat set is reached through the owner's own personas. An unowned id simply matches no chat.
  const narrow = characterId === undefined ? sql`` : sql`AND ch.id IN (SELECT cp2.chat_id FROM chat_participants cp2 WHERE cp2.character_id = ${characterId})`;
  const rows = await db.all<{
    personaId: PersonaId;
    name: string;
    chatCount: number;
    messageCount: number;
    tokensOut: number;
    tokensOutMeasuredSamples: number;
    tokensOutEstimatedSamples: number;
    lastUsedAt: number | null;
  }>(sql`
    WITH persona_chats AS (
      SELECT p.id AS persona_id, ch.id AS chat_id, ch.updated_at AS updated_at
      FROM personas p JOIN chats ch ON ch.anchor_persona_id = p.id
      WHERE p.owner_id = ${ownerId} ${narrow}
      UNION
      SELECT p.id AS persona_id, cp.chat_id AS chat_id, ch.updated_at AS updated_at
      FROM personas p
      JOIN chat_participants cp ON cp.active_persona_id = p.id
      JOIN chats ch ON ch.id = cp.chat_id
      WHERE p.owner_id = ${ownerId} ${narrow}
    )
    SELECT p.id AS personaId, p.name AS name,
           COUNT(DISTINCT pc.chat_id) AS chatCount,
           COUNT(m.id) AS messageCount,
           COALESCE(SUM(v.tokens_out), 0) AS tokensOut,
           SUM(CASE WHEN v.tokens_out IS NOT NULL AND v.token_provenance = 'measured' THEN 1 ELSE 0 END) AS tokensOutMeasuredSamples,
           SUM(CASE WHEN v.tokens_out IS NOT NULL AND v.token_provenance = 'estimated' THEN 1 ELSE 0 END) AS tokensOutEstimatedSamples,
           MAX(pc.updated_at) AS lastUsedAt
    FROM personas p
    LEFT JOIN persona_chats pc ON pc.persona_id = p.id
    LEFT JOIN messages m ON m.chat_id = pc.chat_id
    LEFT JOIN message_variants v ON v.id = m.selected_variant_id
    WHERE p.owner_id = ${ownerId}
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);
  return rows.map((r) => ({
    // Raw-SQL boundary mint: `p.id` is the branded personas.id column, but sql`` template rows come back
    // untyped.
    personaId: castId<PersonaId>(r.personaId),
    name: r.name,
    chatCount: Number(r.chatCount),
    messageCount: Number(r.messageCount),
    tokensOut: recordedTokens(Number(r.tokensOut), Number(r.tokensOutMeasuredSamples), Number(r.tokensOutEstimatedSamples)),
    tokensOutProvenance: aggregateTokenProvenance(Number(r.tokensOutMeasuredSamples), Number(r.tokensOutEstimatedSamples)),
    lastUsedAt: r.lastUsedAt ?? null,
  }));
}

function temporalFrom(days: { day: string; count: number }[]): TemporalStats {
  const active = days.filter((d) => d.count > 0);
  let busiest: { day: string; count: number } | null = null;
  const dow = [0, 0, 0, 0, 0, 0, 0];
  for (const d of active) {
    if (!busiest || d.count > busiest.count) {
      busiest = d;
    }
    // `new Date(arg)` parses a known timestamp (not ambient now) — allowed by no-raw-clock.
    const wd = new Date(`${d.day}T00:00:00Z`).getUTCDay();
    dow[wd] = (dow[wd] ?? 0) + d.count;
  }
  // Longest run of consecutive calendar days with activity.
  const sorted = active.map((d) => Date.parse(`${d.day}T00:00:00Z`)).sort((a, b) => a - b);
  let longest = 0;
  let cur = 0;
  let prev: number | null = null;
  for (const t of sorted) {
    cur = prev !== null && t - prev === DAY_MS ? cur + 1 : 1;
    if (cur > longest) {
      longest = cur;
    }
    prev = t;
  }
  return {
    activeDays: active.length,
    longestStreakDays: longest,
    busiestDay: busiest,
    dayOfWeek: dow,
  };
}

async function dailyActivity(db: Db, ownerId: UserId): Promise<{ day: string; count: number }[]> {
  const rows = await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId)).orderBy(dailyStats.day);
  // A day's "activity" = messages exchanged + chats opened that day.
  return rows.map((r) => ({ day: r.day, count: r.userTurns + r.assistantTurns + r.chatsCreated }));
}

export async function readTemporal(db: Db, ownerId: UserId): Promise<TemporalStats> {
  return temporalFrom(await dailyActivity(db, ownerId));
}

/** Assemble the "your RP in numbers" headline from the owner rollup + the leaderboard top + the daily
 *  timeseries. Null until the rollup has run. */
export async function readWrapped(db: Db, ownerId: UserId): Promise<WrappedSummary | null> {
  const o = await readOverview(db, ownerId);
  if (!o) {
    return null;
  }
  const [leaderboard, days] = await Promise.all([readLeaderboard(db, ownerId, { sort: "assistantTurns", limit: 1 }), dailyActivity(db, ownerId)]);
  const top = leaderboard.rows[0];
  const temporal = temporalFrom(days);
  return {
    firstChatAt: o.firstChatAt,
    lastActivityAt: o.lastActivityAt,
    characters: o.characters,
    chats: o.chats,
    words: o.userWords + o.assistantWords,
    replies: o.assistantTurns,
    swipes: o.swipes,
    genTimeMs: o.totalGenTimeMs,
    reasoningMs: o.reasoningMs,
    costUsd: o.costUsd,
    avgSwipeDepth: o.avgSwipeDepth,
    swipeRate: o.swipeRate,
    throughputTps: o.throughputTps,
    forkedChats: o.forkedChats,
    topCharacter: top ? { name: top.name, assistantTurns: top.assistantTurns } : null,
    temporal,
    computedAt: o.computedAt,
  };
}
