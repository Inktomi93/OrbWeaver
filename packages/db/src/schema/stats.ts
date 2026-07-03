// schema/stats — the four per-owner usage-economics rollups (producer: domain/stats). ECONOMICS ONLY
// (turn counts · words · tokens · cost · cache · timing) — ZERO vector columns (the
// `stats-no-vector-tables` dep-cruiser rule; the type-enforced economics↔semantics line,
// knowledge-cluster §7 invariant #7: discovery is semantics, stats is economics, they share no tables).
//
// OWNERSHIP STAMP (ledger D23 — the one-FK-to-an-owned-parent test):
//   • owner_stats / daily_stats / model_stats KEEP `ownerId` — they are PARENTLESS per-user aggregates
//     (owner × {— | day | model×provider}); `ownerId` is the row's OWN key, not a redundant mirror.
//     FK users RESTRICT (a user with a rollup cannot be hard-deleted out from under it).
//   • character_stats DROPS `ownerId` — it has a single owning parent (the character), so the owner is
//     reachable by ONE FK (`characterId → characters.ownerId`); per-owner reads scope via
//     `characterId ∈ {my characters}` (the leaderboard/character verbs JOIN characters). Keyed on
//     `characterId` (FK characters CASCADE — the rollup dies with its character).
//
// KEYS: owner_stats PK = `ownerId` NATURAL — the per-user row IS keyed by the user (the OwnerStatId brand
// exists but is reserved/unused; there is no second id). character_stats / daily_stats / model_stats carry
// a TypeID `id` PK (minted in `domain/stats/write/*` via `ID_PREFIX.{characterStat,dailyStat,modelStat}`)
// PLUS a UNIQUE on their natural business key — that unique is the live-delta UPSERT conflict target
// (`character`, `(owner, day)`, `(owner, model, provider)`).
//
// `model_stats.provider` is `NOT NULL DEFAULT '(unknown)'` — LOAD-BEARING (invariant #5): the
// `(ownerId, model, provider)` unique-index upsert relies on it. SQLite treats SQL
// NULLs as DISTINCT, so a true-NULL provider would never conflict-match and would accumulate duplicate
// rows across every recompute. `@orb/kit/stats-tally.modelKey` coalesces `null → '(unknown)'` for BOTH the
// live delta AND reconcile; this schema default is the third key site that must coalesce identically.
//
// TIMESTAMPS are plain EPOCH-MS NUMBER columns (`integer`), never drizzle `timestamp_ms`/Date — the stats
// views type every timestamp as `number` and the delta's `now`/`firstAt`/`lastAt` are epoch-ms numbers.
// `firstChatAt` (MIN) · `lastActivityAt` (MAX) · `maxContextTokens` (MAX) are NON-additive extrema merged
// by MIN/MAX in the upsert, not `col += delta`. `computedAt` (MAX) is freshness.
// NO TTFT/gen percentile columns anywhere — percentiles are computed ON READ, never stored (invariant #6).
//
// Cache economics (`cacheReadTokens`/`cacheWriteTokens`) + `maxContextTokens` are OWNER + MODEL grain only,
// NOT per-character — character_stats omits them.

import type { CharacterId, CharacterStatId, DailyStatId, ModelStatId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { characters } from "./character";
import { users } from "./users";

// The `(unknown)` provider sentinel — see header. Mirrors `@orb/kit/stats-tally.modelKey`'s null-coalesce
// and the read-side model/latency keys; all three MUST stay aligned (invariant #5).
const PROVIDER_FALLBACK = "(unknown)";

// Born-at-insert epoch-ms clock for `computedAt` (the live delta always supplies `delta.now`; this default
// only covers a bare insert). SQL `unixepoch()`, never a JS clock (the determinism gate).
const NOW_MS = sql`(unixepoch() * 1000)`;

// owner_stats — per-user GLOBAL totals (owner × —), one row per user. NATURAL PK on `ownerId`.
// Always written by reconcile (even all-zeros) so `freshness` distinguishes computed-empty from never-run.
export const ownerStats = sqliteTable("owner_stats", {
  // NATURAL PK + FK users RESTRICT (D23 parentless aggregate — the user is the key, not a mirror).
  ownerId: text("owner_id")
    .$type<UserId>()
    .primaryKey()
    .references(() => users.id, { onDelete: "restrict" }),
  // Owner-grain counts. `characters` live-undercounts until a drift-repair reconcile (esoteric #10).
  characters: integer("characters").notNull().default(0),
  chats: integer("chats").notNull().default(0),
  userTurns: integer("user_turns").notNull().default(0),
  assistantTurns: integer("assistant_turns").notNull().default(0),
  systemTurns: integer("system_turns").notNull().default(0),
  swipes: integer("swipes").notNull().default(0),
  userWords: integer("user_words").notNull().default(0),
  assistantWords: integer("assistant_words").notNull().default(0),
  swipeWords: integer("swipe_words").notNull().default(0),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  // `real` — cost is fractional USD (the additive `col += delta` metric).
  costUsd: real("cost_usd").notNull().default(0),
  genTimeMs: integer("gen_time_ms").notNull().default(0),
  genSamples: integer("gen_samples").notNull().default(0),
  reasoningGenerations: integer("reasoning_generations").notNull().default(0),
  reasoningMs: integer("reasoning_ms").notNull().default(0),
  activeIdxSum: integer("active_idx_sum").notNull().default(0),
  variantMessages: integer("variant_messages").notNull().default(0),
  forkedChats: integer("forked_chats").notNull().default(0),
  contentBytes: integer("content_bytes").notNull().default(0),
  // Cache economics — OWNER + MODEL grain only (esoteric #5); live-only (0 on ST imports).
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  // Owner-only MAX extremum (epoch-ms-independent); null until a live turn supplies it (null on imports).
  maxContextTokens: integer("max_context_tokens"),
  // Extrema (epoch-ms numbers): firstChatAt MIN-merged, lastActivityAt MAX-merged (esoteric #6).
  firstChatAt: integer("first_chat_at"),
  lastActivityAt: integer("last_activity_at"),
  // MAX-merged freshness stamp (epoch-ms).
  computedAt: integer("computed_at").notNull().default(NOW_MS),
});

// character_stats — per-character totals, ONE row per character (esoteric #9: grouped on `characters.id`
// directly under D28 — there is no character_versions to collapse). NO `ownerId` (D23 — derive via
// characterId → characters.ownerId). NO cache / maxContextTokens (owner+model grain only — esoteric #5).
export const characterStats = sqliteTable(
  "character_stats",
  {
    // TypeID PK (`character_stat_…`), minted in domain/stats/write/*; brand is type-only, SQL is TEXT.
    id: text("id").$type<CharacterStatId>().primaryKey(),
    // The owning character. CASCADE: the rollup dies with its character.
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    chats: integer("chats").notNull().default(0),
    userTurns: integer("user_turns").notNull().default(0),
    assistantTurns: integer("assistant_turns").notNull().default(0),
    systemTurns: integer("system_turns").notNull().default(0),
    swipes: integer("swipes").notNull().default(0),
    userWords: integer("user_words").notNull().default(0),
    assistantWords: integer("assistant_words").notNull().default(0),
    swipeWords: integer("swipe_words").notNull().default(0),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    genTimeMs: integer("gen_time_ms").notNull().default(0),
    genSamples: integer("gen_samples").notNull().default(0),
    reasoningGenerations: integer("reasoning_generations").notNull().default(0),
    reasoningMs: integer("reasoning_ms").notNull().default(0),
    activeIdxSum: integer("active_idx_sum").notNull().default(0),
    variantMessages: integer("variant_messages").notNull().default(0),
    forkedChats: integer("forked_chats").notNull().default(0),
    contentBytes: integer("content_bytes").notNull().default(0),
    // Extrema (epoch-ms numbers) — MIN/MAX-merged (esoteric #6).
    firstChatAt: integer("first_chat_at"),
    lastActivityAt: integer("last_activity_at"),
    computedAt: integer("computed_at").notNull().default(NOW_MS),
  },
  (table) => [
    // One rollup row per character — the live-delta UPSERT conflict target.
    uniqueIndex("character_stats_character_unique").on(table.characterId),
  ],
);

// daily_stats — per-(owner, day) timeseries, WIDE format. KEEPS `ownerId` (D23 parentless aggregate).
// Daily credits the MESSAGE stream only (esoteric #1): a variant (swipe) bumps `swipes`/`genTimeMs` but
// NOT `tokensIn`/`tokensOut` (the message delta sets those; the variant delta omits dailyTokensIn/Out).
export const dailyStats = sqliteTable(
  "daily_stats",
  {
    // TypeID PK (`daily_stat_…`), minted in domain/stats/write/*.
    id: text("id").$type<DailyStatId>().primaryKey(),
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // The UTC 'YYYY-MM-DD' bucket (produced by `@orb/kit/stats-tally.utcDay`). Plain TEXT, NOT a date.
    day: text("day").notNull(),
    chatsCreated: integer("chats_created").notNull().default(0),
    userTurns: integer("user_turns").notNull().default(0),
    assistantTurns: integer("assistant_turns").notNull().default(0),
    systemTurns: integer("system_turns").notNull().default(0),
    swipes: integer("swipes").notNull().default(0),
    userWords: integer("user_words").notNull().default(0),
    assistantWords: integer("assistant_words").notNull().default(0),
    // The daily token slice (delta `dailyTokensIn`/`dailyTokensOut`) — DECOUPLED from the scalar tokens.
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    genTimeMs: integer("gen_time_ms").notNull().default(0),
    // OR-merged in the upsert: once a day is flagged migration-approximate it stays (esoteric #7).
    messageDatesApprox: integer("message_dates_approx", { mode: "boolean" })
      .notNull()
      .default(false),
    computedAt: integer("computed_at").notNull().default(NOW_MS),
  },
  (table) => [
    // owner × day — the live-delta UPSERT conflict target.
    uniqueIndex("daily_stats_owner_day_unique").on(table.ownerId, table.day),
  ],
);

// model_stats — per-(owner, model, provider) generation provenance. KEEPS `ownerId` (D23 parentless
// aggregate). `provider` NOT NULL DEFAULT '(unknown)' is LOAD-BEARING (see header / invariant #5).
// Cache economics ride here (owner + MODEL grain — esoteric #5).
export const modelStats = sqliteTable(
  "model_stats",
  {
    // TypeID PK (`model_stat_…`), minted in domain/stats/write/*.
    id: text("id").$type<ModelStatId>().primaryKey(),
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    model: text("model").notNull(),
    // LOAD-BEARING `(unknown)` sentinel — NOT NULL so the (owner, model, provider) unique never splits on
    // a NULL (SQLite NULLs are DISTINCT → duplicate rows across recompute). Coalesced to match modelKey.
    provider: text("provider").notNull().default(PROVIDER_FALLBACK),
    generations: integer("generations").notNull().default(0),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    genTimeMs: integer("gen_time_ms").notNull().default(0),
    genSamples: integer("gen_samples").notNull().default(0),
    reasoningGenerations: integer("reasoning_generations").notNull().default(0),
    reasoningMs: integer("reasoning_ms").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    // Cache economics — owner + MODEL grain (esoteric #5).
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    computedAt: integer("computed_at").notNull().default(NOW_MS),
  },
  (table) => [
    // owner × model × provider — the live-delta UPSERT conflict target; relies on `provider` NOT NULL.
    uniqueIndex("model_stats_owner_model_provider_unique").on(
      table.ownerId,
      table.model,
      table.provider,
    ),
  ],
);
