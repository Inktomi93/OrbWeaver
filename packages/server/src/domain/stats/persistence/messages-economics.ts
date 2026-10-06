// The stats-owned economics projection. The only place the raw per-generation economics columns of a turn
// are projected + aggregated; the caller (the injected discovery insights op) receives a narrowed,
// already-summed result — never a shape it can re-sum. The raw row shape below is module-private, so no
// consumer can name a `tokens_out` column.
//
// Economics live on `message_variants`, not `messages` — the read aggregates the selected variant of each
// assistant slot, so a swipe that isn't selected never double-counts. Owner scope derives via
// `messages.character_id → characters.owner_id` PLUS the domain's one owner-chat definition
// (`substrate/owner-chat-scope.ts`, #1477): a husk chat (`chats.started_at IS NULL`, e.g. an unclaimed
// seeded greeting) is never one of the owner's chats, so its assistant generations must not enter these
// sums either — #1791 found both reads here still scanning past that boundary after #1477 fixed
// heatmap/momentum/latency/rebuild.

import type { CharacterEconomics, CharacterModelEconomics } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { characters, messages, messageVariants } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";
import type { SelectedCostMaps } from "../contract/cost-samples.ts";
import { ownerChatIds } from "../substrate/owner-chat-scope.ts";
import { aggregateTokenProvenance, recordedTokens } from "../substrate/rates.ts";
import { costOfSamples, createSelectedCostAccumulator, modelCostKey } from "../substrate/selected-cost-samples.ts";

// The raw aggregated row as it comes back from the untyped `sql`` boundary — module-private.
interface EconomicsRow {
  readonly characterId: CharacterId;
  readonly generations: number;
  readonly tokensIn: number;
  readonly tokensInMeasuredSamples: number;
  readonly tokensInEstimatedSamples: number;
  /** NULL when no selected variant of this character recorded a `tokens_out` at all — see the read. */
  readonly tokensOut: number | null;
  readonly tokensOutMeasuredSamples: number;
  readonly tokensOutEstimatedSamples: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

interface ModelEconomicsRow {
  readonly characterId: CharacterId;
  readonly model: string;
  readonly provider: string | null;
  readonly generations: number;
  readonly tokensOut: number;
  readonly tokensOutMeasuredSamples: number;
  readonly tokensOutEstimatedSamples: number;
  readonly genTimeMs: number;
  readonly genSamples: number;
}

const COST_PAGE_ROWS = 5000;

// Scalar-null variants still contain known leg facts; SQL SUM(cost_usd) alone erases their compatibility.
async function readSelectedCostSamples(db: Db, ownerId: UserId): Promise<SelectedCostMaps> {
  const cost = createSelectedCostAccumulator(ownerId);
  let lastId = "";
  for (;;) {
    // @orb-waive no-await-db-in-loop(limit): keyset pagination bounds the selected canon corpus at COST_PAGE_ROWS, never one query per entity; ends if this reader stops paging.
    const rows = await db
      .select({
        id: messageVariants.id,
        characterId: characters.id,
        model: messageVariants.model,
        provider: messageVariants.provider,
        costUsd: messageVariants.costUsd,
        metadata: messageVariants.metadata,
      })
      .from(messages)
      .innerJoin(characters, eq(characters.id, messages.characterId))
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(
        and(
          eq(characters.ownerId, ownerId),
          eq(messages.role, "assistant"),
          sql`${messages.chatId} in (${ownerChatIds(ownerId)})`,
          sql`${messageVariants.id} > ${lastId}`,
        ),
      )
      .orderBy(messageVariants.id)
      .limit(COST_PAGE_ROWS);
    cost.append(rows);
    lastId = rows.at(-1)?.id ?? lastId;
    if (rows.length < COST_PAGE_ROWS) {
      break;
    }
  }
  return cost.maps;
}

/** Per-character economics — the selected assistant-variant totals, owner-scoped. One row per character
 *  that has ≥1 assistant generation.
 *
 *  `tokensOut`'s never-recorded signal lives in `tokensOutMeasuredSamples`/`tokensOutEstimatedSamples`, not
 *  in the SQL sum: `recordedTokens` (substrate/rates.ts) returns `null` whenever both sample counters are
 *  zero, regardless of the coalesced total, so the mapper can safely `?? 0` the sum before calling it. The
 *  other sums keep their COALESCE: a missing cache count on a local-model turn genuinely IS zero. Cost has
 *  its own sample count: compatible available prices form a partial subtotal, and missing prices are omitted. */
export async function readCharacterEconomics(db: Db, ownerId: UserId): Promise<CharacterEconomics[]> {
  const costSamples = (await readSelectedCostSamples(db, ownerId)).characters;
  const rows = await db.all<EconomicsRow>(sql`
    SELECT m.character_id AS characterId,
           COUNT(*) AS generations,
           COALESCE(SUM(v.tokens_in), 0) AS tokensIn,
           SUM(v.tokens_out) AS tokensOut,
           SUM(CASE WHEN v.tokens_in IS NOT NULL AND v.token_provenance = 'measured' THEN 1 ELSE 0 END) AS tokensInMeasuredSamples,
           SUM(CASE WHEN v.tokens_in IS NOT NULL AND v.token_provenance = 'estimated' THEN 1 ELSE 0 END) AS tokensInEstimatedSamples,
           SUM(CASE WHEN v.tokens_out IS NOT NULL AND v.token_provenance = 'measured' THEN 1 ELSE 0 END) AS tokensOutMeasuredSamples,
           SUM(CASE WHEN v.tokens_out IS NOT NULL AND v.token_provenance = 'estimated' THEN 1 ELSE 0 END) AS tokensOutEstimatedSamples,
           COALESCE(SUM(v.cache_read_tokens), 0) AS cacheReadTokens,
           COALESCE(SUM(v.cache_write_tokens), 0) AS cacheWriteTokens
    FROM messages m
    JOIN characters c ON c.id = m.character_id
    JOIN message_variants v ON v.id = m.selected_variant_id
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant' AND m.chat_id IN (${ownerChatIds(ownerId)})
    GROUP BY m.character_id
  `);
  return rows.map((r) => ({
    // Raw-SQL boundary mint: `m.character_id` is the branded characters.id column; sql`` rows come back
    // untyped.
    characterId: castId<CharacterId>(r.characterId),
    generations: Number(r.generations),
    tokensIn: recordedTokens(Number(r.tokensIn), Number(r.tokensInMeasuredSamples), Number(r.tokensInEstimatedSamples)),
    tokensInProvenance: aggregateTokenProvenance(Number(r.tokensInMeasuredSamples), Number(r.tokensInEstimatedSamples)),
    // The sample counters, not this sum, decide recorded-vs-null (see recordedTokens) — coalescing here is safe.
    tokensOut: recordedTokens(Number(r.tokensOut ?? 0), Number(r.tokensOutMeasuredSamples), Number(r.tokensOutEstimatedSamples)),
    tokensOutProvenance: aggregateTokenProvenance(Number(r.tokensOutMeasuredSamples), Number(r.tokensOutEstimatedSamples)),
    costUsd: costOfSamples(costSamples.get(r.characterId)),
    cacheReadTokens: Number(r.cacheReadTokens),
    cacheWriteTokens: Number(r.cacheWriteTokens),
  }));
}

/** Per-(character, model) economics — the selected assistant-variant totals split by model, owner-scoped.
 *  `genTimeMs`/`genSamples` sum only variants carrying both gen timestamps. Model-less generations are
 *  excluded. */
export async function readCharacterModelEconomics(db: Db, ownerId: UserId): Promise<CharacterModelEconomics[]> {
  const costSamples = (await readSelectedCostSamples(db, ownerId)).models;
  const rows = await db.all<ModelEconomicsRow>(sql`
    SELECT m.character_id AS characterId,
           v.model AS model,
           v.provider AS provider,
           COUNT(*) AS generations,
           COALESCE(SUM(v.tokens_out), 0) AS tokensOut,
           SUM(CASE WHEN v.tokens_out IS NOT NULL AND v.token_provenance = 'measured' THEN 1 ELSE 0 END) AS tokensOutMeasuredSamples,
           SUM(CASE WHEN v.tokens_out IS NOT NULL AND v.token_provenance = 'estimated' THEN 1 ELSE 0 END) AS tokensOutEstimatedSamples,
           COALESCE(SUM(CASE
             WHEN v.gen_started_at IS NOT NULL AND v.gen_finished_at IS NOT NULL
             THEN v.gen_finished_at - v.gen_started_at END), 0) AS genTimeMs,
           SUM(CASE
             WHEN v.gen_started_at IS NOT NULL AND v.gen_finished_at IS NOT NULL
             THEN 1 ELSE 0 END) AS genSamples
    FROM messages m
    JOIN characters c ON c.id = m.character_id
    JOIN message_variants v ON v.id = m.selected_variant_id
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant' AND v.model IS NOT NULL
      AND m.chat_id IN (${ownerChatIds(ownerId)})
    GROUP BY m.character_id, v.model, v.provider
  `);
  return rows.map((r) => ({
    characterId: castId<CharacterId>(r.characterId),
    model: r.model,
    provider: r.provider,
    generations: Number(r.generations),
    tokensOut: recordedTokens(Number(r.tokensOut), Number(r.tokensOutMeasuredSamples), Number(r.tokensOutEstimatedSamples)),
    tokensOutProvenance: aggregateTokenProvenance(Number(r.tokensOutMeasuredSamples), Number(r.tokensOutEstimatedSamples)),
    genTimeMs: Number(r.genTimeMs),
    genSamples: Number(r.genSamples),
    costUsd: costOfSamples(costSamples.get(modelCostKey(r.characterId, r.model, r.provider))),
  }));
}
