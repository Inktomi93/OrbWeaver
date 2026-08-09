// `@orb/contracts/stats` — the chat↔stats economics WIRE: `StatsDelta` (the per-canon-write increment
// payload chat produces every turn) + `ApplyStatsDelta` (the injected-op signature stats' write
// substrate fulfils). Lives here (not `domain/stats`) because a feature home would force an illegal
// chat→stats sideways import; the apply IMPL lives in `domain/stats/write/apply-delta.ts`.

import type { CharacterId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The page CEILING for the stats top-N reads (`leaderboard`, `byModel`, `momentum`), enforced at the
 *  transport trust boundary (the `CHARACTER_LIST_MAX_LIMIT` precedent). The same 200 the persistence
 *  `rollups.ts` DoS clamp references (homed HERE so the wire ceiling and the clamp never drift); `momentum`
 *  has no domain clamp, so this ceiling is its sole bound. An over-bound ask is a BAD_REQUEST. */
export const STATS_LIST_MAX_LIMIT = 200;

/** The per-canon-write increment payload, applied in the same `db.batch()` as the canon write. Three
 *  decoupled slices: SCALAR (monotonic per-character/per-owner totals), DAILY (`dailyTokensIn`/`Out`,
 *  decoupled so a swipe can bump `day.swipes` without touching `day.tokens`), MODEL (`modelGenerations`/…,
 *  decoupled so a swipe on a different model never double-counts scalar). No `.default()`: an omitted
 *  increment stays absent (the delta is a sparse patch). */
export const statsDeltaSchema = z.object({
  ownerId: brandedId<UserId>(),
  // null for system / no-character writes → `character_stats` is skipped for this delta.
  characterId: typeIdSchema(ID_PREFIX.character).nullable(),
  // 'YYYY-MM-DD' UTC of the message (the `daily_stats` grain — produced by `@orb/kit/stats-tally.utcDay`).
  day: z.string(),
  // null → `model_stats` is skipped; `provider` coalesces to '(unknown)' at the model-key seam, not here.
  model: z.string().nullable(),
  provider: z.string().nullable(),

  userTurns: z.number().optional(),
  assistantTurns: z.number().optional(),
  systemTurns: z.number().optional(),
  swipes: z.number().optional(),
  userWords: z.number().optional(),
  assistantWords: z.number().optional(),
  swipeWords: z.number().optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  costUsd: z.number().optional(),
  genTimeMs: z.number().optional(),
  genSamples: z.number().optional(),
  reasoningGenerations: z.number().optional(),
  reasoningMs: z.number().optional(),
  activeIdxSum: z.number().optional(),
  variantMessages: z.number().optional(),
  forkedChats: z.number().optional(),
  contentBytes: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  // per-character + per-owner chat count (chat created / forked / deleted).
  chats: z.number().optional(),
  // per-day chats-created (the `daily_stats` column; bucketed on `day`).
  chatsCreated: z.number().optional(),
  // `daily_stats` flag — set when a migrated chat clobbers a message day (OR-merged in the upsert).
  messageDatesApprox: z.boolean().optional(),

  dailyTokensIn: z.number().optional(),
  dailyTokensOut: z.number().optional(),

  modelGenerations: z.number().optional(),
  modelTokensIn: z.number().optional(),
  modelTokensOut: z.number().optional(),
  modelGenTimeMs: z.number().optional(),
  modelGenSamples: z.number().optional(),
  modelReasoningGenerations: z.number().optional(),
  modelReasoningMs: z.number().optional(),
  modelCostUsd: z.number().optional(),
  modelCacheReadTokens: z.number().optional(),
  modelCacheWriteTokens: z.number().optional(),

  // Bump `owner_stats.characters` by 1 — set ONLY when this write is the FIRST chat for a character
  // (live-undercounts a character with no chats until a drift-repair reconcile; documented, acceptable).
  newCharacter: z.boolean().optional(),
  firstAt: z.number().nullable().optional(), // candidate for firstChatAt (MIN)
  lastAt: z.number().nullable().optional(), // candidate for lastActivityAt (MAX)
  maxContextTokens: z.number().nullable().optional(), // candidate for owner_stats.maxContextTokens (MAX)
  now: z.number(), // epoch-ms stamped as computedAt (MAX) so freshness() sees the latest write
});

/** The chat↔stats wire payload — chat PRODUCES it, the stats write substrate CONSUMES it. */
export type StatsDelta = z.infer<typeof statsDeltaSchema>;

/** The signature of the injected upsert op — chat receives this typed and calls it to enqueue the
 *  rollup-increment statements into the same canon-write batch, so chat never imports the stats
 *  schema-write at runtime. `@orb/contracts` may not import `@orb/db`/drizzle, so `Batch`/`Db` are
 *  generic, bound to concrete db types at the impl + injection sites. */
export type ApplyStatsDelta<Batch, Db> = (batch: Batch, db: Db, delta: StatsDelta) => void;

// The narrowed, already-aggregated economics results stats hands to a consumer (discovery's insights)
// through an injected op — the raw `message_variants` economics row is unspellable outside stats, so a
// consumer never re-sums a column itself.

/** Per-character economics rollup (selected assistant-variant totals, owner-scoped). Absent characters
 *  (no assistant generation) simply don't appear. */
export interface CharacterEconomics {
  readonly characterId: CharacterId;
  /** Assistant generations counted (selected variants of the character's assistant messages). */
  readonly generations: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

/** Per-(character, model) economics rollup. `genTimeMs` is the sum of wall-clock durations over
 *  `genSamples` variants carrying both timestamps (so a consumer derives a mean without null-skew). */
export interface CharacterModelEconomics {
  readonly characterId: CharacterId;
  readonly model: string;
  readonly provider: string | null;
  readonly generations: number;
  readonly tokensOut: number;
  readonly genTimeMs: number;
  readonly genSamples: number;
  readonly costUsd: number;
}

// ── The `reconcile-stats` workload's terminal result (the workloads junk-drawer exit: authored by the
//    OWNING domain). The same rebuild also runs awaited, in-request, off the import post-settle. ──

/** The rollup rebuild's counts: owners swept, character rollups rewritten. */
export interface ReconcileStatsWorkloadResult {
  readonly owners: number;
  readonly characters: number;
}
