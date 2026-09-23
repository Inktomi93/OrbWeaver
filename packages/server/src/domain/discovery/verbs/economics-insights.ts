// domain/discovery/verbs/economics-insights — the ECONOMICS-COMPOSED insights (the seam's Tier 3,
// PD-40/PD-22). discovery owns the SEMANTICS, stats owns the ECONOMICS — each verb
// keeps its ranking/grouping in discovery and pulls the cost/usage dimension from the INJECTED `stats` op
// (wired at the entry root onto the DI bundle, like `writeHubScores`/`summarize`). discovery NEVER SUMs a
// raw `messages` economics column (Knowledge-Cluster inv #5).
//   • forgottenGems — SEMANTIC ranking (assistant-message volume + recency) composed with per-character
//     economics (`ctx.characterEconomics`) for the tokensOut/cost dimension.
//   • modelRouting  — discovery supplies each character's distilled GENRE (`character_summaries`), the stats
//     op (`ctx.characterModelEconomics`) supplies which model performed how; grouped to (genre, model).

import type { TokenProvenance } from "@orb/contracts/chat";
import { combineTokenProvenance } from "@orb/contracts/chat";
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

/** Milliseconds in a day — the unit `daysQuiet` is expressed in, so the log's shape is human-readable. */
const DAY_MS = 86_400_000;

/**
 * THE CONJUNCTION IS THE RANK (corpus forensics §6, R5). "Invested, BUT QUIET" is an AND, and it used to be
 * a lexicographic sort — `messageCount` primary, `lastActiveAt` a tie-break — over a high-cardinality
 * integer, so the second term was unreachable by construction: on the live library 20 of 20 gems had
 * distinct message counts, the quiet axis contributed NOTHING, and the headline "forgotten gem" was the
 * character the owner had played six hours earlier. The owner-picked mockup drew every tile reading
 * "2w quiet", i.e. its data had the quiet axis doing visible work; this restores that, it does not invent it.
 *
 * `messageCount × log1p(daysQuiet)` multiplies rather than orders, so neither term can be starved by the
 * other's cardinality: a huge, still-live character scores ~0 (it is not forgotten), and a tiny, ancient one
 * cannot outrank a substantial one on age alone.
 *
 * NO CLOCK. `daysQuiet` is measured against the library's OWN newest activity, not `Date.now()` — discovery
 * verbs are deterministic (D46) and an ambient clock here would make the shelf untestable and time-varying
 * for identical data. The reference is the most recent `lastActiveAt` among the candidates, which is also the
 * more truthful frame: "quiet compared with the rest of your library", not "quiet compared with this
 * instant". The most-recently-played character has quiet = 0 and therefore scores 0, which is the point.
 */
function gemRank(messageCount: number, lastActiveAt: number, newestActiveAt: number): number {
  const daysQuiet = Math.max(0, newestActiveAt - lastActiveAt) / DAY_MS;
  return messageCount * Math.log1p(daysQuiet);
}

/**
 * The owner's revisit candidates — characters that carry real INVESTED message volume AND have gone quiet,
 * ranked by the conjunction of the two ({@link gemRank}). The SEMANTIC ranking is discovery's; the
 * `tokensOut`/`costUsd` come from the injected per-character economics op (never a raw `messages` SUM).
 * A character with no economics row keeps its semantic rank and reports `tokensOut: null` — "we have no
 * accounting for this one", which is most of an imported library and is NOT the zero it used to report
 * (side-eye corpus re-pass B2). Cost follows the same honesty rule: unrecorded is null, never a fabricated
 * zero-dollar observation.
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
      tokensOut: econ === undefined ? null : econ.tokensOut,
      tokensOutProvenance: econ?.tokensOutProvenance ?? "unrecorded",
      costUsd: econ?.costUsd ?? null,
    };
  });
  const newestActiveAt = Math.max(...gems.map((g) => g.lastActiveAt), 0);
  // Ties (identical rank — e.g. every candidate equally quiet) fall back to volume, then to a stable id
  // order, so the same library always yields the same shelf.
  gems.sort(
    (a, b) =>
      gemRank(b.messageCount, b.lastActiveAt, newestActiveAt) - gemRank(a.messageCount, a.lastActiveAt, newestActiveAt) ||
      b.messageCount - a.messageCount ||
      (a.characterId < b.characterId ? -1 : 1),
  );
  return gems.slice(0, limit);
}

// One (genre, model) accumulator — discovery folds the per-(character, model) economics into it by the
// character's distilled genre. `genTimeMs`/`genSamples` carry the null-safe mean inputs.
interface RoutingBucket {
  genre: string;
  model: string;
  provider: string | null;
  generations: number;
  tokensOut: number | null;
  tokensOutProvenance: TokenProvenance;
  genTimeMs: number;
  genSamples: number;
  costUsd: number | null;
}

/** Add one recorded nullable total without turning two absent observations into zero. */
function addRecorded(total: number | null, value: number | null): number | null {
  return value === null ? total : (total ?? 0) + value;
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
        tokensOutProvenance: e.tokensOutProvenance,
        genTimeMs: e.genTimeMs,
        genSamples: e.genSamples,
        costUsd: e.costUsd,
      });
    } else {
      bucket.generations += e.generations;
      bucket.tokensOut = addRecorded(bucket.tokensOut, e.tokensOut);
      bucket.tokensOutProvenance = combineTokenProvenance(bucket.tokensOutProvenance, e.tokensOutProvenance);
      bucket.genTimeMs += e.genTimeMs;
      bucket.genSamples += e.genSamples;
      bucket.costUsd = addRecorded(bucket.costUsd, e.costUsd);
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
        tokensOutProvenance: b.tokensOutProvenance,
        avgGenTimeMs: b.genSamples > 0 ? b.genTimeMs / b.genSamples : null,
        costUsd: b.costUsd,
      }),
    )
    .sort((a, b) => a.genre.localeCompare(b.genre) || b.generations - a.generations);
}
