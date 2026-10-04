// verb: embedCorpus — bulk text catch-up sweep, driven by the embed-corpus workload. Enumerates characters
// and routes each through the one write path (store). Resumable via store's content_hash short-circuit
// (force bypasses it); cooperative abort between items and at the embed's wait on the model, every completed
// item durable + idempotent; an embed failure (an abort mid-embed included) propagates so the rerun resumes.
//
// This is the REINDEX half of purge+reindex. The purge already happened when the owner's target moved to a
// new generation (`persistence/space-state.ts` `switchTargetGeneration`), so this sweep only refills the
// cards. A complete sweep records the `cards` scope's completion per owner (vector tasks are owner-scoped,
// §7.5); an aborted one records nothing, leaves a partial new-generation index, and the rerun finishes it.

import type { CharacterId, UserId } from "@orb/kit/ids";
import { GenerationSupersededError } from "#kit/embedding-generation";
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
  sweep: { readonly force: boolean | undefined; readonly signal: AbortSignal; readonly receipts: Map<UserId, StoreResult> },
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
    force: sweep.force,
    signal: sweep.signal,
  });
  const prior = sweep.receipts.get(cardOwnerId);
  if (prior !== undefined && prior.generationId !== result.generationId) {
    throw new GenerationSupersededError(cardOwnerId, "card");
  }
  sweep.receipts.set(cardOwnerId, result);
  return result.outcome === "written" ? "written" : "skipped";
}

export function createEmbedCorpus(ctx: EmbeddingsContext, deps: { readonly store: EmbeddingsService["store"] }): EmbeddingsService["embedCorpus"] {
  return async ({ force, signal, ownerId, onProgress }: EmbedPassParams): Promise<BulkEmbedResult> => {
    let embedded = 0;
    let skipped = 0;
    // Every owner the sweep resolved, with the space it embedded into — the purge set.
    const receipts = new Map<UserId, StoreResult>();
    const characterIds = await ctx.listCharacterIds(ownerId);
    for (const characterId of characterIds) {
      if (signal.aborted) {
        break;
      }
      if ((await embedOneCard(ctx, deps, characterId, { force, signal, receipts })) === "written") {
        embedded += 1;
      } else {
        skipped += 1;
      }
      onProgress?.(embedded + skipped, characterIds.length);
    }
    // Only a complete sweep may claim the `cards` scope; an aborted one leaves the space moving.
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
