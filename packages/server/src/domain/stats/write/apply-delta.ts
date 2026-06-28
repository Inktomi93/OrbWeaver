// domain/stats/write/apply-delta — the LIVE write path (the write half of the read/write CQRS split).
// Turns one per-canon-write `StatsDelta` (the chat↔stats wire, @orb/contracts/stats — chat PRODUCES it,
// this CONSUMES it) into UPSERT-increment statements for the four rollup tables (db/schema/stats.ts),
// PUSHED into the caller's existing batch so the rollups commit ATOMICALLY in the SAME db.batch() as the
// canon write — the rollups stay fresh with no rebuild. NOT a service verb; injected into chat's
// composition root as `ChatServiceDeps.applyStatsDelta` (typed `ApplyStatsDelta`); the default is a no-op.
//
// CORRECTNESS CONTRACT (invariant #3 — the drift gate): `applyStatsDelta` over a turn's canon change MUST
// equal a fresh `reconcileStats` rebuild over the same canon, column-for-column. Each chat call site
// computes the delta as the CHANGE its write makes — append (a new message) emits the new contribution;
// mutate (swipe/edit/delete) emits `(new − old)`. NEGATIVE increments are legal (a delete) — the additive
// `col += excluded.col` handles them; the extrema (MIN/MAX) never go negative.
//
// TWO MERGE MODES (the load-bearing distinction, esoteric #6):
//   • ADDITIVE `col = col + excluded.col` — every monotonic counter/sum.
//   • EXTREMA MIN/MAX — `firstChatAt` (MIN), `lastActivityAt`/`maxContextTokens`/`computedAt` (MAX). An
//     extremum is NOT additive; it merges by MIN/MAX so a re-rolled turn doesn't double-count it.
// The `messageDatesApprox` flag is OR-merged (once a day is flagged migrated-approx it stays — esoteric #7).
//
// ORBWEAVER SCHEMA DELTAS vs neo: character_stats DROPS `ownerId` (D23 — owner derives via
// characterId→characters.ownerId), so its conflict target is the `characterId` unique index and the row
// omits ownerId. The gen-time column is `genTimeMs` (delta `genTimeMs`); cache/maxContextTokens are
// owner+model grain only (character_stats omits them — esoteric #5). The ONE batch cast is centralized in
// `@orb/db/kit` (`batchStmt`), not the ~59 inline `as BatchItem` casts neo carried.

import type { ApplyStatsDelta, StatsDelta } from "@orb/contracts/stats";
import type { BatchStmt, Db } from "@orb/db";
import { batchStmt, characterStats, dailyStats, modelStats, ownerStats } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";

// The model_stats `(unknown)` provider sentinel — see schema/stats.ts header + invariant #5. NOT NULL so
// the (owner, model, provider) unique never splits on a NULL; coalesced HERE to match `@orb/kit/stats-tally
// .modelKey` and the read-side keys (all three sites must agree).
const UNKNOWN_PROVIDER = "(unknown)";

/** Coalesce an absent increment to 0 (the delta is a sparse patch — an omitted field is "no change"). */
const n = (v: number | undefined): number => v ?? 0;

/**
 * Push the four UPSERT-increment statements into the caller's batch array (appends; returns nothing — the
 * caller commits the batch atomically with its canon write). Typed `ApplyStatsDelta<BatchStmt, Db>` (the
 * contract op signature bound to the concrete db types here). A site touching two model buckets (a swipe
 * whose model differs from the original) calls this once per single-model delta into the same batch.
 */
export const applyStatsDelta: ApplyStatsDelta<BatchStmt[], Db> = (
  batch: BatchStmt[],
  db: Db,
  delta: StatsDelta,
): void => {
  const lastAt = delta.lastAt ?? null;
  const firstAt = delta.firstAt ?? null;
  const maxCtx = delta.maxContextTokens ?? null;

  // ── character_stats (skipped for a null character) — NO ownerId (D23); conflict on the characterId
  //    unique index. Owner derives via characterId→characters.ownerId at read time. ──
  if (delta.characterId !== null) {
    batch.push(
      batchStmt(
        db
          .insert(characterStats)
          .values({
            id: mintTypeId(ID_PREFIX.characterStat),
            characterId: delta.characterId,
            chats: n(delta.chats),
            userTurns: n(delta.userTurns),
            assistantTurns: n(delta.assistantTurns),
            systemTurns: n(delta.systemTurns),
            swipes: n(delta.swipes),
            userWords: n(delta.userWords),
            assistantWords: n(delta.assistantWords),
            swipeWords: n(delta.swipeWords),
            tokensIn: n(delta.tokensIn),
            tokensOut: n(delta.tokensOut),
            costUsd: n(delta.costUsd),
            genTimeMs: n(delta.genTimeMs),
            genSamples: n(delta.genSamples),
            reasoningGenerations: n(delta.reasoningGenerations),
            reasoningMs: n(delta.reasoningMs),
            activeIdxSum: n(delta.activeIdxSum),
            variantMessages: n(delta.variantMessages),
            forkedChats: n(delta.forkedChats),
            contentBytes: n(delta.contentBytes),
            firstChatAt: firstAt,
            lastActivityAt: lastAt,
            computedAt: delta.now,
          })
          .onConflictDoUpdate({
            target: characterStats.characterId,
            set: {
              chats: sql`${characterStats.chats} + excluded.chats`,
              userTurns: sql`${characterStats.userTurns} + excluded.user_turns`,
              assistantTurns: sql`${characterStats.assistantTurns} + excluded.assistant_turns`,
              systemTurns: sql`${characterStats.systemTurns} + excluded.system_turns`,
              swipes: sql`${characterStats.swipes} + excluded.swipes`,
              userWords: sql`${characterStats.userWords} + excluded.user_words`,
              assistantWords: sql`${characterStats.assistantWords} + excluded.assistant_words`,
              swipeWords: sql`${characterStats.swipeWords} + excluded.swipe_words`,
              tokensIn: sql`${characterStats.tokensIn} + excluded.tokens_in`,
              tokensOut: sql`${characterStats.tokensOut} + excluded.tokens_out`,
              costUsd: sql`${characterStats.costUsd} + excluded.cost_usd`,
              genTimeMs: sql`${characterStats.genTimeMs} + excluded.gen_time_ms`,
              genSamples: sql`${characterStats.genSamples} + excluded.gen_samples`,
              reasoningGenerations: sql`${characterStats.reasoningGenerations} + excluded.reasoning_generations`,
              reasoningMs: sql`${characterStats.reasoningMs} + excluded.reasoning_ms`,
              activeIdxSum: sql`${characterStats.activeIdxSum} + excluded.active_idx_sum`,
              variantMessages: sql`${characterStats.variantMessages} + excluded.variant_messages`,
              forkedChats: sql`${characterStats.forkedChats} + excluded.forked_chats`,
              contentBytes: sql`${characterStats.contentBytes} + excluded.content_bytes`,
              // MIN(firstChatAt) / MAX(lastActivityAt) — keep the extreme non-null (esoteric #6).
              firstChatAt: sql`MIN(COALESCE(${characterStats.firstChatAt}, excluded.first_chat_at), COALESCE(excluded.first_chat_at, ${characterStats.firstChatAt}))`,
              lastActivityAt: sql`MAX(COALESCE(${characterStats.lastActivityAt}, excluded.last_activity_at), COALESCE(excluded.last_activity_at, ${characterStats.lastActivityAt}))`,
              computedAt: sql`MAX(${characterStats.computedAt}, excluded.computed_at)`,
            },
          }),
      ),
    );
  }

  // ── owner_stats (ALWAYS — even an all-zeros touch keeps the row present for freshness). NATURAL PK on
  //    ownerId. `characters` bumps only on the FIRST chat for a character (newCharacter — esoteric #10). ──
  batch.push(
    batchStmt(
      db
        .insert(ownerStats)
        .values({
          ownerId: delta.ownerId,
          characters: delta.newCharacter ? 1 : 0,
          chats: n(delta.chats),
          userTurns: n(delta.userTurns),
          assistantTurns: n(delta.assistantTurns),
          systemTurns: n(delta.systemTurns),
          swipes: n(delta.swipes),
          userWords: n(delta.userWords),
          assistantWords: n(delta.assistantWords),
          swipeWords: n(delta.swipeWords),
          tokensIn: n(delta.tokensIn),
          tokensOut: n(delta.tokensOut),
          costUsd: n(delta.costUsd),
          genTimeMs: n(delta.genTimeMs),
          genSamples: n(delta.genSamples),
          reasoningGenerations: n(delta.reasoningGenerations),
          reasoningMs: n(delta.reasoningMs),
          activeIdxSum: n(delta.activeIdxSum),
          variantMessages: n(delta.variantMessages),
          forkedChats: n(delta.forkedChats),
          contentBytes: n(delta.contentBytes),
          cacheReadTokens: n(delta.cacheReadTokens),
          cacheWriteTokens: n(delta.cacheWriteTokens),
          maxContextTokens: maxCtx,
          firstChatAt: firstAt,
          lastActivityAt: lastAt,
          computedAt: delta.now,
        })
        .onConflictDoUpdate({
          target: ownerStats.ownerId,
          set: {
            characters: sql`${ownerStats.characters} + excluded.characters`,
            chats: sql`${ownerStats.chats} + excluded.chats`,
            userTurns: sql`${ownerStats.userTurns} + excluded.user_turns`,
            assistantTurns: sql`${ownerStats.assistantTurns} + excluded.assistant_turns`,
            systemTurns: sql`${ownerStats.systemTurns} + excluded.system_turns`,
            swipes: sql`${ownerStats.swipes} + excluded.swipes`,
            userWords: sql`${ownerStats.userWords} + excluded.user_words`,
            assistantWords: sql`${ownerStats.assistantWords} + excluded.assistant_words`,
            swipeWords: sql`${ownerStats.swipeWords} + excluded.swipe_words`,
            tokensIn: sql`${ownerStats.tokensIn} + excluded.tokens_in`,
            tokensOut: sql`${ownerStats.tokensOut} + excluded.tokens_out`,
            costUsd: sql`${ownerStats.costUsd} + excluded.cost_usd`,
            genTimeMs: sql`${ownerStats.genTimeMs} + excluded.gen_time_ms`,
            genSamples: sql`${ownerStats.genSamples} + excluded.gen_samples`,
            reasoningGenerations: sql`${ownerStats.reasoningGenerations} + excluded.reasoning_generations`,
            reasoningMs: sql`${ownerStats.reasoningMs} + excluded.reasoning_ms`,
            activeIdxSum: sql`${ownerStats.activeIdxSum} + excluded.active_idx_sum`,
            variantMessages: sql`${ownerStats.variantMessages} + excluded.variant_messages`,
            forkedChats: sql`${ownerStats.forkedChats} + excluded.forked_chats`,
            contentBytes: sql`${ownerStats.contentBytes} + excluded.content_bytes`,
            cacheReadTokens: sql`${ownerStats.cacheReadTokens} + excluded.cache_read_tokens`,
            cacheWriteTokens: sql`${ownerStats.cacheWriteTokens} + excluded.cache_write_tokens`,
            maxContextTokens: sql`MAX(COALESCE(${ownerStats.maxContextTokens}, excluded.max_context_tokens), COALESCE(excluded.max_context_tokens, ${ownerStats.maxContextTokens}))`,
            firstChatAt: sql`MIN(COALESCE(${ownerStats.firstChatAt}, excluded.first_chat_at), COALESCE(excluded.first_chat_at, ${ownerStats.firstChatAt}))`,
            lastActivityAt: sql`MAX(COALESCE(${ownerStats.lastActivityAt}, excluded.last_activity_at), COALESCE(excluded.last_activity_at, ${ownerStats.lastActivityAt}))`,
            computedAt: sql`MAX(${ownerStats.computedAt}, excluded.computed_at)`,
          },
        }),
    ),
  );

  // ── daily_stats (ALWAYS — the per-day timeseries point). Daily tokens credit the MESSAGE stream only:
  //    `dailyTokensIn/Out` are DECOUPLED from the scalar tokens, so a swipe bumps day.swipes/genTimeMs but
  //    NOT day.tokens (esoteric #1 — a variant delta omits dailyTokensIn/Out). ──
  batch.push(
    batchStmt(
      db
        .insert(dailyStats)
        .values({
          id: mintTypeId(ID_PREFIX.dailyStat),
          ownerId: delta.ownerId,
          day: delta.day,
          chatsCreated: n(delta.chatsCreated),
          userTurns: n(delta.userTurns),
          assistantTurns: n(delta.assistantTurns),
          systemTurns: n(delta.systemTurns),
          swipes: n(delta.swipes),
          userWords: n(delta.userWords),
          assistantWords: n(delta.assistantWords),
          tokensIn: n(delta.dailyTokensIn),
          tokensOut: n(delta.dailyTokensOut),
          costUsd: n(delta.costUsd),
          genTimeMs: n(delta.genTimeMs),
          messageDatesApprox: delta.messageDatesApprox ?? false,
          computedAt: delta.now,
        })
        .onConflictDoUpdate({
          target: [dailyStats.ownerId, dailyStats.day],
          set: {
            chatsCreated: sql`${dailyStats.chatsCreated} + excluded.chats_created`,
            userTurns: sql`${dailyStats.userTurns} + excluded.user_turns`,
            assistantTurns: sql`${dailyStats.assistantTurns} + excluded.assistant_turns`,
            systemTurns: sql`${dailyStats.systemTurns} + excluded.system_turns`,
            swipes: sql`${dailyStats.swipes} + excluded.swipes`,
            userWords: sql`${dailyStats.userWords} + excluded.user_words`,
            assistantWords: sql`${dailyStats.assistantWords} + excluded.assistant_words`,
            tokensIn: sql`${dailyStats.tokensIn} + excluded.tokens_in`,
            tokensOut: sql`${dailyStats.tokensOut} + excluded.tokens_out`,
            costUsd: sql`${dailyStats.costUsd} + excluded.cost_usd`,
            genTimeMs: sql`${dailyStats.genTimeMs} + excluded.gen_time_ms`,
            // OR the approx flag — once a day is flagged migrated-approx it stays so (esoteric #7).
            messageDatesApprox: sql`(${dailyStats.messageDatesApprox} OR excluded.message_dates_approx)`,
            computedAt: sql`MAX(${dailyStats.computedAt}, excluded.computed_at)`,
          },
        }),
    ),
  );

  // ── model_stats (skipped for a null model). provider coalesces to the `(unknown)` sentinel so the
  //    (owner, model, provider) unique never splits on a NULL (invariant #5). ──
  if (delta.model !== null) {
    batch.push(
      batchStmt(
        db
          .insert(modelStats)
          .values({
            id: mintTypeId(ID_PREFIX.modelStat),
            ownerId: delta.ownerId,
            model: delta.model,
            provider: delta.provider ?? UNKNOWN_PROVIDER,
            generations: n(delta.modelGenerations),
            tokensIn: n(delta.modelTokensIn),
            tokensOut: n(delta.modelTokensOut),
            genTimeMs: n(delta.modelGenTimeMs),
            genSamples: n(delta.modelGenSamples),
            reasoningGenerations: n(delta.modelReasoningGenerations),
            reasoningMs: n(delta.modelReasoningMs),
            costUsd: n(delta.modelCostUsd),
            cacheReadTokens: n(delta.modelCacheReadTokens),
            cacheWriteTokens: n(delta.modelCacheWriteTokens),
            computedAt: delta.now,
          })
          .onConflictDoUpdate({
            target: [modelStats.ownerId, modelStats.model, modelStats.provider],
            set: {
              generations: sql`${modelStats.generations} + excluded.generations`,
              tokensIn: sql`${modelStats.tokensIn} + excluded.tokens_in`,
              tokensOut: sql`${modelStats.tokensOut} + excluded.tokens_out`,
              genTimeMs: sql`${modelStats.genTimeMs} + excluded.gen_time_ms`,
              genSamples: sql`${modelStats.genSamples} + excluded.gen_samples`,
              reasoningGenerations: sql`${modelStats.reasoningGenerations} + excluded.reasoning_generations`,
              reasoningMs: sql`${modelStats.reasoningMs} + excluded.reasoning_ms`,
              costUsd: sql`${modelStats.costUsd} + excluded.cost_usd`,
              cacheReadTokens: sql`${modelStats.cacheReadTokens} + excluded.cache_read_tokens`,
              cacheWriteTokens: sql`${modelStats.cacheWriteTokens} + excluded.cache_write_tokens`,
              computedAt: sql`MAX(${modelStats.computedAt}, excluded.computed_at)`,
            },
          }),
      ),
    );
  }
};
