// domain/discovery/verbs/economics-insights — the ECONOMICS-COMPOSED insights (the seam's Tier 3,
// stats-discovery-seam.md; PD-40/PD-22). discovery owns the SEMANTICS, stats owns the ECONOMICS — each verb
// keeps its ranking/grouping in discovery and pulls the cost/usage dimension from the INJECTED `stats` op
// (wired at the entry root onto the DI bundle, like `writeHubScores`/`summarize`). discovery NEVER SUMs a
// raw `messages` economics column (Knowledge-Cluster inv #5).
//   • forgottenGems — SEMANTIC ranking (assistant-message volume + recency) composed with per-character
//     economics (`ctx.characterEconomics`) for the tokensOut/cost dimension.
//   • modelRouting  — discovery supplies each character's distilled GENRE (`character_summaries`), the stats
//     op (`ctx.characterModelEconomics`) supplies which model performed how; grouped to (genre, model).

import type { UserId } from "@orb/kit/ids";
import type { DiscoveryContext } from "../context.ts";
import type { ForgottenGem, ModelRoutingRow } from "../contract/results.ts";
import type { DiscoveryService } from "../contract/service.ts";
import { readForgottenGemCandidates } from "../persistence/message-reads.ts";
import { readOwnedCardFacets } from "../persistence/summary-reads.ts";

// Default cap on the revisit-candidate list (the long tail below the top gems is noise).
const DEFAULT_FORGOTTEN_GEMS_LIMIT = 20;

/** Bind the economics-composed insights over the DI bundle (the injected stats ops arrive on `ctx`). */
export function createEconomicsInsights(ctx: DiscoveryContext): Pick<DiscoveryService, "forgottenGems" | "modelRouting"> {
  return {
    forgottenGems: (userId, limit) => forgottenGems(ctx, userId, limit),
    modelRouting: (userId) => modelRouting(ctx, userId),
  };
}

/**
 * The owner's revisit candidates — characters with real INVESTED message volume, ranked by that volume then
 * by staleness (most-messages first, then longest-quiet first). The SEMANTIC ranking (count + recency) is
 * discovery's; the `tokensOut`/`costUsd` come from the injected per-character economics op (never a raw
 * `messages` SUM). Characters with no recorded economics default to zeros (the semantic signal still ranks).
 */
async function forgottenGems(ctx: DiscoveryContext, ownerId: UserId, limit = DEFAULT_FORGOTTEN_GEMS_LIMIT): Promise<ForgottenGem[]> {
  const [candidates, economics] = await Promise.all([readForgottenGemCandidates(ctx.db, ownerId), ctx.characterEconomics(ownerId)]);
  const econByCharacter = new Map(economics.map((e) => [e.characterId, e]));
  const gems = candidates.map((c): ForgottenGem => {
    const econ = econByCharacter.get(c.characterId);
    return {
      characterId: c.characterId,
      name: c.name,
      avatarHash: c.avatarHash,
      messageCount: c.messageCount,
      lastActiveAt: c.lastActiveAt,
      tokensOut: econ?.tokensOut ?? 0,
      costUsd: econ?.costUsd ?? 0,
    };
  });
  // Invested (high message volume) first; quiet (older last-active) breaks ties — a forgotten GEM.
  gems.sort((a, b) => b.messageCount - a.messageCount || a.lastActiveAt - b.lastActiveAt);
  return gems.slice(0, limit);
}

// One (genre, model) accumulator — discovery folds the per-(character, model) economics into it by the
// character's distilled genre. `genTimeMs`/`genSamples` carry the null-safe mean inputs.
interface RoutingBucket {
  genre: string;
  model: string;
  provider: string | null;
  generations: number;
  tokensOut: number;
  genTimeMs: number;
  genSamples: number;
  costUsd: number;
}

/**
 * Which model the owner actually routes each distilled GENRE to. discovery maps each character to its
 * `character_summaries.genre` (a character with no distilled genre is skipped — it can't be attributed); the
 * injected `stats` op supplies the per-(character, model) economics, which we re-group to (genre, model).
 * Ordered by genre, then most-used model first.
 */
async function modelRouting(ctx: DiscoveryContext, ownerId: UserId): Promise<ModelRoutingRow[]> {
  const [facets, economics] = await Promise.all([readOwnedCardFacets(ctx.db, ownerId), ctx.characterModelEconomics(ownerId)]);
  const genreByCharacter = new Map<string, string>();
  for (const f of facets) {
    if (f.genre !== null) {
      genreByCharacter.set(f.characterId, f.genre);
    }
  }
  const buckets = new Map<string, RoutingBucket>();
  for (const e of economics) {
    const genre = genreByCharacter.get(e.characterId);
    if (genre === undefined) {
      continue;
    }
    const key = `${genre}\u0000${e.model}\u0000${e.provider ?? ""}`;
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, {
        genre,
        model: e.model,
        provider: e.provider,
        generations: e.generations,
        tokensOut: e.tokensOut,
        genTimeMs: e.genTimeMs,
        genSamples: e.genSamples,
        costUsd: e.costUsd,
      });
    } else {
      bucket.generations += e.generations;
      bucket.tokensOut += e.tokensOut;
      bucket.genTimeMs += e.genTimeMs;
      bucket.genSamples += e.genSamples;
      bucket.costUsd += e.costUsd;
    }
  }
  return [...buckets.values()]
    .map(
      (b): ModelRoutingRow => ({
        genre: b.genre,
        model: b.model,
        provider: b.provider,
        generations: b.generations,
        tokensOut: b.tokensOut,
        avgGenTimeMs: b.genSamples > 0 ? b.genTimeMs / b.genSamples : null,
        costUsd: b.costUsd,
      }),
    )
    .sort((a, b) => a.genre.localeCompare(b.genre) || b.generations - a.generations);
}
