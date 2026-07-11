// `@orb/contracts/stats` — the chat↔stats economics WIRE: `StatsDelta` (the per-canon-write increment
// payload chat PRODUCES every turn) + `ApplyStatsDelta` (the injected-op signature stats' write substrate
// fulfils). DAG root: kit-only (the `UserId`/`CharacterId` brands + their id schemas from `@orb/kit/ids`)
// + zod. No domain, no `@orb/db`, no sibling contracts node.
//
// WHY contracts and NOT a stats-feature type (core/Legacy-Migration-and-Gaps.md §4/§7 refinement #2): chat
// builds a `StatsDelta` every send/edit/fork/delete and hands it to the injected `applyStatsDelta`; a
// feature home (`domain/stats`) would force an illegal chat→stats sideways import (`domain-no-cross-feature`).
// The chat-side BUILDERS (`messageDelta`/`variantDelta`/`chatCreatedDelta`) live in `domain/chat/engine`;
// the apply IMPL (the upsert touching the four rollup tables) lives in `domain/stats/write/apply-delta.ts`.
// The pure tally primitives (`wordCount`/`utcDay`/`modelKey`) are `@orb/kit/stats-tally` (imported at
// runtime by BOTH the chat builders AND `reconcileStats` so the live delta can't drift) — NOT re-homed here.
// Ported from neo-tavern `_shared/stats-tally.ts` (the wire-type half only).

import type { CharacterId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/**
 * The per-canon-write increment payload, applied in the SAME `db.batch()` as the canon write so the
 * rollups stay fresh with no rebuild. THREE DECOUPLED SLICES:
 *   • SCALAR — the monotonic per-character + per-owner totals (all optional, default 0);
 *   • DAILY  — `dailyTokensIn`/`dailyTokensOut`, DECOUPLED from the scalar tokens so a variant (swipe)
 *     can bump `day.swipes`/`day.genTimeMs` while leaving `day.tokens` untouched (daily credits the
 *     MESSAGE stream only) — a variant delta sets scalar `tokensIn` but omits these two;
 *   • MODEL  — `modelGenerations`/`modelTokensIn`/… DECOUPLED so a swipe whose model differs from the
 *     original emits one scalar delta + one model-only delta per bucket without double-counting scalar.
 * The maintenance fields (`newCharacter`, `firstAt`, `lastAt`, `maxContextTokens`, `now`) carry the
 * NON-additive extrema reconcile derives via MIN/MAX (negative increments are legal — a delete emits
 * `new − old`; the extrema never go negative). NO TTFT/gen percentile fields — those are computed on read.
 * No `.default()` on any field: an omitted increment stays absent (the delta is a sparse patch).
 */
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

/**
 * The signature of the injected upsert op — chat receives this (typed) at its composition root and calls
 * it to enqueue the rollup-increment statements into the SAME canon-write batch, so the chat feature
 * never imports the stats schema-write at runtime (the real impl is `domain/stats/write/apply-delta.ts`,
 * injected as `ChatServiceDeps.applyStatsDelta`; the default is a no-op for tests that don't assert stats).
 *
 * `@orb/contracts` is kit-only and may NOT import `@orb/db`/drizzle, so the neo concrete
 * `BatchItem<"sqlite">[]` + `Db` params become GENERIC type parameters bound to the concrete db types at
 * the impl + injection sites — the chat↔stats wire stays db-free here. The op MUTATES `batch` (push) and
 * returns nothing.
 */
export type ApplyStatsDelta<Batch, Db> = (batch: Batch, db: Db, delta: StatsDelta) => void;

// ── the stats↔discovery economics PROJECTION (PD-22, the seam's Tier 2) ─────────────────────────────────
// The NARROWED, already-aggregated economics results the stats domain hands to a consumer (discovery's
// Tier-3 insights) through an injected op. These are the ONLY economics shapes that cross the stats fence:
// each is a per-grain ROLLUP (the raw `message_variants` economics row — tokens/cost/cache/timing — is
// UNSPELLABLE outside `domain/stats/persistence/messages-economics.ts`, so a consumer can NEVER re-sum a
// column itself; it receives these summed results and composes its own SEMANTIC ranking around them). The
// economics are the D26-correct SELECTED-variant totals (economics live on `message_variants`, not
// `messages`). Kept in `@orb/contracts/stats` (kit-only, db-free) — the same DAG-root home as the chat↔stats
// wire — so discovery references the RESULT type without any path into the stats schema-read.

/** Per-character economics rollup (the SELECTED assistant-variant totals, owner-scoped) — the cost/usage
 *  dimension `forgottenGems` attaches to its semantic revisit ranking. Absent characters (no assistant
 *  generation) simply don't appear. */
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

/** Per-(character, model) economics rollup — the grain `modelRouting` re-groups by the character's distilled
 *  genre (discovery owns the genre → model attribution; stats owns which model performed how). `genTimeMs` is
 *  the SUM of wall-clock generation durations over `genSamples` variants that carried both timestamps (so a
 *  consumer derives a mean without a null-skew); `provider` is null when the generation recorded none. */
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
