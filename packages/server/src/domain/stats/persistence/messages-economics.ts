// The stats-owned economics projection. The only place the raw per-generation economics columns of a turn
// are projected + aggregated; the caller (the injected discovery insights op) receives a narrowed,
// already-summed result — never a shape it can re-sum. The raw row shape below is module-private, so no
// consumer can name a `tokens_out` column.
//
// Economics live on `message_variants`, not `messages` — the read aggregates the selected variant of each
// assistant slot, so a swipe that isn't selected never double-counts. Owner scope derives via
// `messages.character_id → characters.owner_id`.

import type { CharacterEconomics, CharacterModelEconomics } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";

// The raw aggregated row as it comes back from the untyped `sql`` boundary — module-private.
interface EconomicsRow {
  readonly characterId: CharacterId;
  readonly generations: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

interface ModelEconomicsRow {
  readonly characterId: CharacterId;
  readonly model: string;
  readonly provider: string | null;
  readonly generations: number;
  readonly tokensOut: number;
  readonly genTimeMs: number;
  readonly genSamples: number;
  readonly costUsd: number;
}

/** Per-character economics — the selected assistant-variant totals, owner-scoped. One row per character
 *  that has ≥1 assistant generation. */
export async function readCharacterEconomics(db: Db, ownerId: UserId): Promise<CharacterEconomics[]> {
  const rows = await db.all<EconomicsRow>(sql`
    SELECT m.character_id AS characterId,
           COUNT(*) AS generations,
           COALESCE(SUM(v.tokens_in), 0) AS tokensIn,
           COALESCE(SUM(v.tokens_out), 0) AS tokensOut,
           COALESCE(SUM(v.cost_usd), 0) AS costUsd,
           COALESCE(SUM(v.cache_read_tokens), 0) AS cacheReadTokens,
           COALESCE(SUM(v.cache_write_tokens), 0) AS cacheWriteTokens
    FROM messages m
    JOIN characters c ON c.id = m.character_id
    JOIN message_variants v ON v.id = m.selected_variant_id
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant'
    GROUP BY m.character_id
  `);
  return rows.map((r) => ({
    // Raw-SQL boundary mint: `m.character_id` is the branded characters.id column; sql`` rows come back
    // untyped.
    characterId: castId<CharacterId>(r.characterId),
    generations: Number(r.generations),
    tokensIn: Number(r.tokensIn),
    tokensOut: Number(r.tokensOut),
    costUsd: Number(r.costUsd),
    cacheReadTokens: Number(r.cacheReadTokens),
    cacheWriteTokens: Number(r.cacheWriteTokens),
  }));
}

/** Per-(character, model) economics — the selected assistant-variant totals split by model, owner-scoped.
 *  `genTimeMs`/`genSamples` sum only variants carrying both gen timestamps. Model-less generations are
 *  excluded. */
export async function readCharacterModelEconomics(db: Db, ownerId: UserId): Promise<CharacterModelEconomics[]> {
  const rows = await db.all<ModelEconomicsRow>(sql`
    SELECT m.character_id AS characterId,
           v.model AS model,
           v.provider AS provider,
           COUNT(*) AS generations,
           COALESCE(SUM(v.tokens_out), 0) AS tokensOut,
           COALESCE(SUM(CASE
             WHEN v.gen_started_at IS NOT NULL AND v.gen_finished_at IS NOT NULL
             THEN v.gen_finished_at - v.gen_started_at END), 0) AS genTimeMs,
           SUM(CASE
             WHEN v.gen_started_at IS NOT NULL AND v.gen_finished_at IS NOT NULL
             THEN 1 ELSE 0 END) AS genSamples,
           COALESCE(SUM(v.cost_usd), 0) AS costUsd
    FROM messages m
    JOIN characters c ON c.id = m.character_id
    JOIN message_variants v ON v.id = m.selected_variant_id
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant' AND v.model IS NOT NULL
    GROUP BY m.character_id, v.model, v.provider
  `);
  return rows.map((r) => ({
    characterId: castId<CharacterId>(r.characterId),
    model: r.model,
    provider: r.provider,
    generations: Number(r.generations),
    tokensOut: Number(r.tokensOut),
    genTimeMs: Number(r.genTimeMs),
    genSamples: Number(r.genSamples),
    costUsd: Number(r.costUsd),
  }));
}
