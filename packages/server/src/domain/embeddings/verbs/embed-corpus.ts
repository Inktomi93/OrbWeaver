// verb: embedCorpus — bulk text catch-up sweep, driven by the embed-corpus workload. Enumerates characters
// and routes each through the one write path (store). Resumable via store's content_hash short-circuit
// (force bypasses it); cooperative abort between items, every completed item durable + idempotent; an embed
// failure propagates so the rerun resumes.
//
// PD-104 — this is the REINDEX half of purge+reindex. After a full BULK sweep re-embeds every card into the
// box's active `(model, dim)` space, it PURGES `character_embeddings` rows left in any OTHER space (an
// old-model change strands them; the uniform `(characterId, model)` upsert key means the new space was
// written additively beside the old, never overwriting it). The purge is PER OWNER (vector tasks are
// owner-scoped, §7.5): every owner the sweep touched has their own stale rows reclaimed against their own
// `embed` binding — a bulk pass covers every owner, a singular pass exactly one, and neither can reach a
// neighbour's live space. On an abort the purge is skipped — the space stays a strict superset (never a gap);
// the rerun reclaims it.

import type { CharacterId, UserId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import type { EmbedPassParams } from "../contract/params.ts";
import type { BulkEmbedResult, StoreResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { markGenerationComplete } from "../persistence/space-state.ts";
import { resolveTargetGeneration } from "../substrate/generation.ts";
import { requireTaskModel } from "../substrate/task-model.ts";

/** One card's sweep step: no text or no owner/embed binding ⇒ skipped (a card whose owner has no `embed`
 *  connection is not embedded in anyone else's space — vector tasks are owner-scoped, §7.5). */
async function embedOneCard(
  ctx: EmbeddingsContext,
  deps: { readonly store: EmbeddingsService["store"] },
  characterId: CharacterId,
  sweep: { readonly force: boolean | undefined; readonly receipts: Map<UserId, StoreResult> },
): Promise<"written" | "skipped"> {
  const text = await ctx.loadCardText(characterId);
  if (text === undefined || text.length === 0) {
    return "skipped";
  }
  const cardOwnerId = await ctx.loadCharacterOwner(characterId);
  const embedModel = cardOwnerId === null ? null : await requireTaskModel(ctx, cardOwnerId, "embed");
  if (cardOwnerId === null || embedModel === null) {
    return "skipped";
  }
  const result = await deps.store({
    kind: "card",
    lens: "card-text",
    ownerId: cardOwnerId,
    characterId,
    content: text,
    model: embedModel,
    dim: ctx.embedDim,
    force: sweep.force,
  });
  const prior = sweep.receipts.get(cardOwnerId);
  if (prior !== undefined && prior.generationId !== result.generationId) {
    throw new Error(`embedding generation changed during card sweep for owner ${cardOwnerId}`);
  }
  sweep.receipts.set(cardOwnerId, result);
  return result.outcome === "written" ? "written" : "skipped";
}

export function createEmbedCorpus(ctx: EmbeddingsContext, deps: { readonly store: EmbeddingsService["store"] }): EmbeddingsService["embedCorpus"] {
  return async ({ force, signal, ownerId }: EmbedPassParams): Promise<BulkEmbedResult> => {
    let embedded = 0;
    let skipped = 0;
    // Every owner the sweep resolved, with the space it embedded into — the purge set.
    const receipts = new Map<UserId, StoreResult>();
    for (const characterId of await ctx.listCharacterIds(ownerId)) {
      if (signal.aborted) {
        break;
      }
      if ((await embedOneCard(ctx, deps, characterId, { force, receipts })) === "written") {
        embedded += 1;
      } else {
        skipped += 1;
      }
    }
    // PD-104 purge (reclaim each touched owner's old space) — only after a complete sweep, never on abort.
    // A no-op for an owner whose embed binding did not change since the last index.
    if (!signal.aborted) {
      await completeCardSweep(ctx, ownerId, receipts);
    }
    return { embedded, skipped };
  };
}

async function completeCardSweep(ctx: EmbeddingsContext, ownerId: UserId | null, receipts: ReadonlyMap<UserId, StoreResult>): Promise<void> {
  for (const [spaceOwnerId, receipt] of receipts) {
    const generation = await resolveTargetGeneration(ctx, spaceOwnerId, "embed");
    if (generation !== null && generation.id === receipt.generationId && generation.epoch === receipt.generationEpoch) {
      await markGenerationComplete(ctx.db, { ownerId: spaceOwnerId, scope: "cards", generation, now: ctx.now() });
    }
  }
  if (ownerId !== null && !receipts.has(ownerId)) {
    const generation = await resolveTargetGeneration(ctx, ownerId, "embed");
    if (generation !== null) {
      await markGenerationComplete(ctx.db, { ownerId, scope: "cards", generation, now: ctx.now() });
    }
  }
}
