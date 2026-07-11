// domain/stats/persistence/messages-economics — PD-22: the stats-OWNED economics PROJECTION (the seam's Tier
// 2, stats-discovery-seam.md). The ONLY place the raw per-generation economics columns (tokens_in/out,
// cost_usd, cache_*, gen_*, ttft_ms, context_window) of a turn are projected + aggregated; the caller (the
// injected discovery insights op) receives a NARROWED, already-summed result — never a shape it can re-sum.
//
// THE TYPE BOUNDARY (the whole point — Knowledge-Cluster inv #5, economics ⟂ semantics): the raw economics
// ROW shape (`EconomicsRow` below) is module-private — it never leaves this file, so no consumer can name a
// `tokens_out` column. Only the pre-aggregated `CharacterEconomics`/`CharacterModelEconomics` results
// (@orb/contracts/stats) cross the fence, via the injected op wired at the composition root. discovery
// composes its SEMANTIC ranking around these totals; it can never SUM `tokens_out` itself.
//
// D26: economics live on `message_variants`, NOT `messages` — the read aggregates the SELECTED variant of
// each assistant slot (`messages.selected_variant_id`), so a swipe that isn't selected never double-counts.
// Owner scope DERIVES via `messages.character_id → characters.owner_id` (D23 — never a caller-supplied owner).

import type { CharacterEconomics, CharacterModelEconomics } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";

// The raw aggregated row as it comes back from the untyped `sql`` boundary — MODULE-PRIVATE (never exported).
// This is the only shape that carries the economics column names; keeping it non-exported is what makes the
// raw economics UNSPELLABLE outside stats (the seam's compile-time half).
interface EconomicsRow {
  readonly characterId: string;
  readonly generations: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

interface ModelEconomicsRow {
  readonly characterId: string;
  readonly model: string;
  readonly provider: string | null;
  readonly generations: number;
  readonly tokensOut: number;
  readonly genTimeMs: number;
  readonly genSamples: number;
  readonly costUsd: number;
}

/** Per-character economics — the SELECTED assistant-variant totals (D26), owner-scoped via
 *  `characters.owner_id`. One row per character that has ≥1 assistant generation. */
export async function readCharacterEconomics(
  db: Db,
  ownerId: UserId,
): Promise<CharacterEconomics[]> {
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
    // Raw-SQL boundary mint: `m.character_id` IS the branded characters.id column; sql`` rows come back
    // untyped — the sanctioned castId edge (mirrors readPersonaUsage's persona-id mint).
    characterId: castId<CharacterId>(r.characterId),
    generations: Number(r.generations ?? 0),
    tokensIn: Number(r.tokensIn ?? 0),
    tokensOut: Number(r.tokensOut ?? 0),
    costUsd: Number(r.costUsd ?? 0),
    cacheReadTokens: Number(r.cacheReadTokens ?? 0),
    cacheWriteTokens: Number(r.cacheWriteTokens ?? 0),
  }));
}

/** Per-(character, model) economics — the SELECTED assistant-variant totals (D26) split by the recorded
 *  model, owner-scoped. `genTimeMs`/`genSamples` sum only variants carrying both gen timestamps (so a
 *  consumer's mean has no null-skew). Model-less generations are excluded (a route needs a model). */
export async function readCharacterModelEconomics(
  db: Db,
  ownerId: UserId,
): Promise<CharacterModelEconomics[]> {
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
    provider: r.provider ?? null,
    generations: Number(r.generations ?? 0),
    tokensOut: Number(r.tokensOut ?? 0),
    genTimeMs: Number(r.genTimeMs ?? 0),
    genSamples: Number(r.genSamples ?? 0),
    costUsd: Number(r.costUsd ?? 0),
  }));
}
