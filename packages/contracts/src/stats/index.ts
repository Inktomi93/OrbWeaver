// `@orb/contracts/stats` — the chat↔stats economics WIRE: `StatsDelta` (the per-canon-write increment
// payload chat produces every turn) + `ApplyStatsDelta` (the injected-op signature stats' write
// substrate fulfils). Lives here (not `domain/stats`) because a feature home would force an illegal
// chat→stats sideways import; the apply IMPL lives in `domain/stats/write/apply-delta.ts`.

import type { CharacterId, ModelId, PersonaId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { MODEL_PROVIDER_UNKNOWN, statsBucketStart } from "@orb/kit/stats-tally";
import { z } from "zod";
import type { ProviderId } from "#inference";
import { modelIdSchema, providerIdSchema } from "#inference";
import type { TokenProvenance } from "../chat/messages.ts";
import { tokenProvenanceSchema } from "../chat/messages.ts";

/** The page CEILING for the stats top-N reads (`leaderboard`, `byModel`), enforced at the transport trust
 *  boundary (the `CHARACTER_LIST_MAX_LIMIT` precedent). The same 200 the persistence `rollups.ts` DoS clamp
 *  references (homed HERE so the wire ceiling and the clamp never drift). An over-bound ask is a BAD_REQUEST. */
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
  // The epoch-ms start of the message's UTC quarter-hour (the `daily_stats` key — produced by
  // `@orb/kit/stats-tally.statsBucketStart`).
  bucketStart: z.number().int(),
  // null → `model_stats` is skipped; `provider` coalesces to '(unknown)' at the model-key seam, not here.
  model: modelIdSchema.nullable(),
  provider: z.union([providerIdSchema, z.literal(MODEL_PROVIDER_UNKNOWN)]).nullable(),

  userTurns: z.number().optional(),
  assistantTurns: z.number().optional(),
  systemTurns: z.number().optional(),
  swipes: z.number().optional(),
  userWords: z.number().optional(),
  assistantWords: z.number().optional(),
  swipeWords: z.number().optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  tokensInMeasuredSamples: z.number().optional(),
  tokensInEstimatedSamples: z.number().optional(),
  tokensOutMeasuredSamples: z.number().optional(),
  tokensOutEstimatedSamples: z.number().optional(),
  costUsd: z.number().optional(),
  costSamples: z.number().optional(),
  genTimeMs: z.number().optional(),
  genSamples: z.number().optional(),
  reasoningGenerations: z.number().optional(),
  reasoningMs: z.number().optional(),
  activeIdxSum: z.number().optional(),
  variantMessages: z.number().optional(),
  forkedChats: z.number().optional(),
  contentChars: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  // per-OWNER chat count (chat created / forked). The per-CHARACTER half is `characterChats` below.
  chats: z.number().optional(),
  // The per-CHARACTER room census: +1 for each SEAT this write creates (#1147). Split off `chats`/
  // `forkedChats` because those two feed `owner_stats` AND `character_stats` from one field, so a
  // multi-seat room could not credit its second seat without double-counting the owner's library. The
  // rebuild defines this column as `COUNT(DISTINCT cp.chat_id)` per character seat
  // (`rebuild-from-canon.ts::loadChatMeta`), so a room with N character seats emits ONE `chats` and N
  // `characterChats`. Same grain split as `daily*`/`model*`.
  characterChats: z.number().optional(),
  characterForkedChats: z.number().optional(),
  // per-bucket chats-created (the `daily_stats` column; bucketed on `bucketStart`).
  chatsCreated: z.number().optional(),
  // `daily_stats` flag — set when a migrated chat clobbers a message time (OR-merged in the upsert).
  messageDatesApprox: z.boolean().optional(),

  dailyTokensIn: z.number().optional(),
  dailyTokensOut: z.number().optional(),
  dailyTokensInMeasuredSamples: z.number().optional(),
  dailyTokensInEstimatedSamples: z.number().optional(),
  dailyTokensOutMeasuredSamples: z.number().optional(),
  dailyTokensOutEstimatedSamples: z.number().optional(),

  modelGenerations: z.number().optional(),
  modelTokensIn: z.number().optional(),
  modelTokensOut: z.number().optional(),
  modelTokensInMeasuredSamples: z.number().optional(),
  modelTokensInEstimatedSamples: z.number().optional(),
  modelTokensOutMeasuredSamples: z.number().optional(),
  modelTokensOutEstimatedSamples: z.number().optional(),
  modelGenTimeMs: z.number().optional(),
  modelGenSamples: z.number().optional(),
  modelReasoningGenerations: z.number().optional(),
  modelReasoningMs: z.number().optional(),
  modelCostUsd: z.number().optional(),
  modelCostSamples: z.number().optional(),
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

/** The increments a SPEND delta may carry: money spent outside the message canon (an image generation, a
 *  compaction pass). The stats rebuild folds exactly these keys, so a key added here without a fold arm
 *  fails `tsc` there rather than drifting the rebuild from the live write. */
export const SPEND_DELTA_FIELDS = ["costUsd", "costSamples", "modelGenerations", "modelGenSamples", "modelCostUsd", "lastAt"] as const;
export type SpendDeltaField = (typeof SPEND_DELTA_FIELDS)[number];

/** A {@link StatsDelta} narrowed to owner, timeline and model grain spend: never a character, never a turn.
 *  @remarks Built only by the spend builders below, which the live writers AND the stats rebuild both call
 *  over the same recorded fields — one builder, so the two writers cannot disagree on what a spend is. */
export type SpendDelta = Pick<StatsDelta, "ownerId" | "bucketStart" | "model" | "now" | SpendDeltaField> & {
  readonly characterId: null;
  readonly provider: ProviderId | null;
};

/** One image generation's spend: `count` pictures from one priced provider call, on one model bucket.
 *  @param costUsd - the call's reported cost; null when the provider reports none (generations still count). */
export function imageGenerationSpendDelta(args: {
  readonly ownerId: UserId;
  readonly model: ModelId;
  readonly provider: ProviderId | null;
  readonly costUsd: number | null;
  readonly count: number;
  readonly now: number;
}): SpendDelta {
  return {
    ownerId: args.ownerId,
    characterId: null,
    bucketStart: statsBucketStart(args.now),
    model: args.model,
    provider: args.provider,
    modelGenerations: args.count,
    modelGenSamples: args.count,
    now: args.now,
    ...(args.costUsd !== null ? { costUsd: args.costUsd, modelCostUsd: args.costUsd } : {}),
  };
}

/** One priced compaction pass: the marker generation's cost on the owner and timeline grains only (no
 *  character, no model rollup, no turn counters), so the quiet operation's spend stays visible on stats. */
export function compactionSpendDelta(args: { readonly ownerId: UserId; readonly costUsd: number; readonly now: number }): SpendDelta {
  return {
    ownerId: args.ownerId,
    characterId: null,
    bucketStart: statsBucketStart(args.now),
    model: null,
    provider: null,
    costUsd: args.costUsd,
    costSamples: 1,
    lastAt: args.now,
    now: args.now,
  };
}

/** The signature of the injected upsert op — chat receives this typed and calls it to enqueue the
 *  rollup-increment statements into the same canon-write batch, so chat never imports the stats
 *  schema-write at runtime. `@orb/contracts` may not import `@orb/db`/drizzle, so `Batch`/`Db` are
 *  generic, bound to concrete db types at the impl + injection sites. */
export type ApplyStatsDelta<Batch, Db> = (batch: Batch, db: Db, delta: StatsDelta) => void;

/** Append only the per-owner rebuild fence to an existing canon batch. Used when canon changes but no
 *  exact incremental rollup delta exists; the next reconcile must still detect the mutation. */
export type BumpStatsCanonVersion<Batch, Db> = (batch: Batch, db: Db, ownerId: UserId) => void;

// The narrowed, already-aggregated economics results stats hands to a consumer (discovery's insights)
// through an injected op — the raw `message_variants` economics row is unspellable outside stats, so a
// consumer never re-sums a column itself.

/** Per-character economics rollup (selected assistant-variant totals, owner-scoped). Absent characters
 *  (no assistant generation) simply don't appear. */
export interface CharacterEconomics {
  readonly characterId: CharacterId;
  /** Assistant generations counted (selected variants of the character's assistant messages). */
  readonly generations: number;
  readonly tokensIn: number | null;
  readonly tokensInProvenance: TokenProvenance;
  /** Output tokens summed over the selected variants — `null` when NOT ONE of them recorded a count.
   *  ABSENT ACCOUNTING IS NOT ZERO (side-eye corpus re-pass B2): an imported library carries thousands of
   *  real assistant turns whose `tokens_out` was never written, and coalescing that to 0 made the corpus
   *  surface print "0 tokens returned" beside "1,187 exchanges" — a contradiction the reader can only
   *  resolve as a bug. A genuine 0 (the provider reported it) still sums to 0 and stays distinguishable. */
  readonly tokensOut: number | null;
  readonly tokensOutProvenance: TokenProvenance;
  readonly costUsd: number | null;
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
  readonly tokensOut: number | null;
  readonly tokensOutProvenance: TokenProvenance;
  readonly genTimeMs: number;
  readonly genSamples: number;
  readonly costUsd: number | null;
}

// ── The `reconcile-stats` workload's terminal result (the workloads junk-drawer exit: authored by the
//    OWNING domain). The same rebuild also runs awaited, in-request, off the import post-settle. ──

/** The rollup rebuild's counts: owners swept, character rollups rewritten. */
export interface ReconcileStatsWorkloadResult {
  readonly owners: number;
  readonly characters: number;
}

export interface ExtraStats {
  reasoningMs: number;
  /** `null` when no contributing generation reported a dollar cost. */
  costUsd: number | null;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  forkedChats: number;
  variantMessages: number;
  maxContextTokens: number | null;
  throughputTps: number;
  avgSwipeDepth: number;
  swipeRate: number;
  /** Share of INPUT tokens served from the prompt cache; `null` when the row carries no cache accounting. */
  cacheHitRate: number | null;
  avgReplyWords: number;
}

/** Unrecorded economics stay null: zero means a measured zero, never missing accounting. */
export interface OwnerStatsView extends ExtraStats {
  characters: number;
  chats: number;
  userTurns: number;
  assistantTurns: number;
  /** Kept separately so complete turn accounting does not drop system canon. */
  systemTurns: number;
  swipes: number;
  userWords: number;
  assistantWords: number;
  swipeWords: number;
  /** `null` when no generation behind this rollup recorded usage. */
  tokensIn: number | null;
  tokensOut: number | null;
  tokensInProvenance: TokenProvenance;
  tokensOutProvenance: TokenProvenance;
  totalGenTimeMs: number;
  avgGenMs: number | null;
  p50GenMs: number | null;
  p90GenMs: number | null;
  avgTtftMs: number | null;
  p50TtftMs: number | null;
  p90TtftMs: number | null;
  reasoningRate: number;
  /** JavaScript string.length totals: UTF-16 code units, not UTF-8 bytes, code points or graphemes. */
  contentChars: number;
  firstChatAt: number | null;
  lastActivityAt: number | null;
  computedAt: number;
}

export interface CharacterStatsView extends OwnerStatsView {
  characterId: CharacterId;
  name: string;
}

export interface LeaderboardRow {
  characterId: CharacterId;
  name: string;
  chats: number;
  userTurns: number;
  assistantTurns: number;
  swipes: number;
  tokensOut: number | null;
  tokensOutProvenance: TokenProvenance;
  totalGenTimeMs: number;
  reasoningRate: number;
  firstChatAt: number | null;
  lastActivityAt: number | null;
}

/** A bounded leaderboard page plus its ranked-population census. Rows are capped at 50 by default and 200
 *  maximum; rows.length is not a census. total counts owner characters with a rollup, not every library
 *  character: a never-played character has no rank.
 */
export interface LeaderboardPage {
  rows: LeaderboardRow[];
  total: number;
}

/** One `daily_stats` row: the owner's activity in one UTC quarter-hour (`@orb/kit/time.CALENDAR_BUCKET_MS`). The wire
 *  carries the bucket's start instant, never a calendar day: the viewer's days, weekdays and hours are
 *  derived from it at the display edge, in the viewer's zone. */
export interface ActivityBucket {
  bucketStart: number;
  chatsCreated: number;
  userTurns: number;
  assistantTurns: number;
  swipes: number;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensInProvenance: TokenProvenance;
  tokensOutProvenance: TokenProvenance;
  genTimeMs: number;
  messageDatesApprox: boolean;
}

export interface ModelStatRow {
  model: string;
  provider: string | null;
  generations: number;
  /** Distinct characters generated for; model_stats is character-less, so this is a separate GROUP BY. */
  charactersUsedWith: number;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensInProvenance: TokenProvenance;
  tokensOutProvenance: TokenProvenance;
  totalGenTimeMs: number;
  avgGenMs: number | null;
  avgTtftMs: number | null;
  p50TtftMs: number | null;
  p90TtftMs: number | null;
  reasoningRate: number;
  throughputTps: number;
  costUsd: number | null;
  reasoningMs: number;
  cacheHitRate: number | null;
}

export interface StatsFreshness {
  computedAt: number | null;
  /** Always false — rollups are maintained live on the write path, so a read is never stale. */
  stale: boolean;
  hasData: boolean;
}

export interface PersonaUsageRow {
  personaId: PersonaId;
  name: string;
  chatCount: number;
  messageCount: number;
  tokensOut: number | null;
  tokensOutProvenance: TokenProvenance;
  lastUsedAt: number | null;
}

export interface WrappedSummary {
  firstChatAt: number | null;
  lastActivityAt: number | null;
  characters: number;
  chats: number;
  words: number;
  replies: number;
  swipes: number;
  genTimeMs: number;
  reasoningMs: number;
  costUsd: number | null;
  avgSwipeDepth: number;
  swipeRate: number;
  throughputTps: number;
  forkedChats: number;
  topCharacter: { name: string; assistantTurns: number } | null;
  computedAt: number;
}

/** One character's replies in one UTC quarter-hour (`@orb/kit/time.CALENDAR_BUCKET_MS`) — the momentum timeline. The
 *  wire carries the bucket's start instant, never a month: the viewer's months are folded on the client. */
export interface MomentumBucket {
  characterId: CharacterId;
  name: string;
  bucketStart: number;
  replies: number;
}

export interface LatencyStats {
  avgTtftMs: number | null;
  p50TtftMs: number | null;
  p90TtftMs: number | null;
  avgGenMs: number | null;
  p50GenMs: number | null;
  p90GenMs: number | null;
}

export const extraStatsSchema = z.strictObject({
  reasoningMs: z.number(),
  costUsd: z.number().nullable(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  forkedChats: z.number(),
  variantMessages: z.number(),
  maxContextTokens: z.number().nullable(),
  throughputTps: z.number(),
  avgSwipeDepth: z.number(),
  swipeRate: z.number(),
  cacheHitRate: z.number().nullable(),
  avgReplyWords: z.number(),
}) satisfies z.ZodType<ExtraStats>;

export const ownerStatsViewSchema = extraStatsSchema.extend({
  characters: z.number(),
  chats: z.number(),
  userTurns: z.number(),
  assistantTurns: z.number(),
  systemTurns: z.number(),
  swipes: z.number(),
  userWords: z.number(),
  assistantWords: z.number(),
  swipeWords: z.number(),
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
  tokensInProvenance: tokenProvenanceSchema,
  tokensOutProvenance: tokenProvenanceSchema,
  totalGenTimeMs: z.number(),
  avgGenMs: z.number().nullable(),
  p50GenMs: z.number().nullable(),
  p90GenMs: z.number().nullable(),
  avgTtftMs: z.number().nullable(),
  p50TtftMs: z.number().nullable(),
  p90TtftMs: z.number().nullable(),
  reasoningRate: z.number(),
  contentChars: z.number(),
  firstChatAt: z.number().nullable(),
  lastActivityAt: z.number().nullable(),
  computedAt: z.number(),
}) satisfies z.ZodType<OwnerStatsView>;

export const characterStatsViewSchema = ownerStatsViewSchema.extend({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
}) satisfies z.ZodType<CharacterStatsView>;

export const leaderboardRowSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  chats: z.number(),
  userTurns: z.number(),
  assistantTurns: z.number(),
  swipes: z.number(),
  tokensOut: z.number().nullable(),
  tokensOutProvenance: tokenProvenanceSchema,
  totalGenTimeMs: z.number(),
  reasoningRate: z.number(),
  firstChatAt: z.number().nullable(),
  lastActivityAt: z.number().nullable(),
}) satisfies z.ZodType<LeaderboardRow>;

export const leaderboardPageSchema = z.strictObject({
  rows: z.array(leaderboardRowSchema),
  total: z.number(),
}) satisfies z.ZodType<LeaderboardPage>;

export const activityBucketSchema = z.strictObject({
  bucketStart: z.number().int(),
  chatsCreated: z.number(),
  userTurns: z.number(),
  assistantTurns: z.number(),
  swipes: z.number(),
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
  tokensInProvenance: tokenProvenanceSchema,
  tokensOutProvenance: tokenProvenanceSchema,
  genTimeMs: z.number(),
  messageDatesApprox: z.boolean(),
}) satisfies z.ZodType<ActivityBucket>;

export const modelStatRowSchema = z.strictObject({
  model: z.string(),
  provider: z.string().nullable(),
  generations: z.number(),
  charactersUsedWith: z.number(),
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
  tokensInProvenance: tokenProvenanceSchema,
  tokensOutProvenance: tokenProvenanceSchema,
  totalGenTimeMs: z.number(),
  avgGenMs: z.number().nullable(),
  avgTtftMs: z.number().nullable(),
  p50TtftMs: z.number().nullable(),
  p90TtftMs: z.number().nullable(),
  reasoningRate: z.number(),
  throughputTps: z.number(),
  costUsd: z.number().nullable(),
  reasoningMs: z.number(),
  cacheHitRate: z.number().nullable(),
}) satisfies z.ZodType<ModelStatRow>;

export const statsFreshnessSchema = z.strictObject({
  computedAt: z.number().nullable(),
  stale: z.boolean(),
  hasData: z.boolean(),
}) satisfies z.ZodType<StatsFreshness>;

export const personaUsageRowSchema = z.strictObject({
  personaId: typeIdSchema(ID_PREFIX.persona),
  name: z.string(),
  chatCount: z.number(),
  messageCount: z.number(),
  tokensOut: z.number().nullable(),
  tokensOutProvenance: tokenProvenanceSchema,
  lastUsedAt: z.number().nullable(),
}) satisfies z.ZodType<PersonaUsageRow>;

export const wrappedSummarySchema = z.strictObject({
  firstChatAt: z.number().nullable(),
  lastActivityAt: z.number().nullable(),
  characters: z.number(),
  chats: z.number(),
  words: z.number(),
  replies: z.number(),
  swipes: z.number(),
  genTimeMs: z.number(),
  reasoningMs: z.number(),
  costUsd: z.number().nullable(),
  avgSwipeDepth: z.number(),
  swipeRate: z.number(),
  throughputTps: z.number(),
  forkedChats: z.number(),
  topCharacter: z.strictObject({ name: z.string(), assistantTurns: z.number() }).nullable(),
  computedAt: z.number(),
}) satisfies z.ZodType<WrappedSummary>;

export const momentumBucketSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  bucketStart: z.number().int(),
  replies: z.number(),
}) satisfies z.ZodType<MomentumBucket>;

export const latencyStatsSchema = z.strictObject({
  avgTtftMs: z.number().nullable(),
  p50TtftMs: z.number().nullable(),
  p90TtftMs: z.number().nullable(),
  avgGenMs: z.number().nullable(),
  p50GenMs: z.number().nullable(),
  p90GenMs: z.number().nullable(),
}) satisfies z.ZodType<LatencyStats>;

/** What a full `reconcileStats` rebuild touched — the workload runner logs it; the drift test asserts it. */
export interface ReconcileStatsResult {
  owners: number;
  characters: number;
  /** `daily_stats` rows written: quarter-hour buckets, not days. */
  buckets: number;
  models: number;
  computedAt: number;
}

export const reconcileStatsResultSchema = z.strictObject({
  owners: z.number(),
  characters: z.number(),
  buckets: z.number(),
  models: z.number(),
  computedAt: z.number(),
}) satisfies z.ZodType<ReconcileStatsResult>;

export const reconcileStatsWorkloadResultSchema = z.strictObject({
  owners: z.number(),
  characters: z.number(),
}) satisfies z.ZodType<ReconcileStatsWorkloadResult>;
