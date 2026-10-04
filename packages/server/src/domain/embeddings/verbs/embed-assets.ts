// The catch-up sweep shares avatar preparation with event delivery and records completed generations.
import type { AssetId, UserId } from "@orb/kit/ids";
import { GenerationSupersededError } from "#kit/embedding-generation";
import type { EmbeddingsContext } from "../context.ts";
import type { EmbedPassParams } from "../contract/params.ts";
import type { BulkEmbedResult, StoreResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { markGenerationComplete } from "../persistence/space-state.ts";
import { resolveTargetGeneration } from "../substrate/generation.ts";
import { resolveImageSpace } from "../substrate/task-model.ts";
export function createEmbedAssets(ctx: EmbeddingsContext, deps: Pick<EmbeddingsService, "indexAsset">): EmbeddingsService["embedAssets"] {
  return async ({ force, signal, ownerId, onProgress }: EmbedPassParams): Promise<BulkEmbedResult> => {
    let embedded = 0;
    let skipped = 0;
    // `ownerId` scopes the sweep to one owner; `null` = every owner. The enumeration is materialised BEFORE
    // the loop because it is also the progress DENOMINATOR — the workload wrapper around this pass cannot
    // know it (issue #166: a sweep that only ever reported a sentence left the card an indeterminate bar
    // through a 350-image run).
    const assetIds = await ctx.listImageAssetIds(ownerId);
    // Every owner the sweep resolved, with the image space it embedded into — the purge set.
    const receipts = new Map<UserId, StoreResult>();
    for (const assetId of assetIds) {
      if (signal.aborted) {
        break; // cooperative abort between assets — every completed embed is durable + idempotent
      }
      const result = await deps.indexAsset(assetId, { force, signal });
      await recordReceipt(ctx, assetId, result, receipts);
      if (result?.outcome === "written") {
        embedded += 1;
      } else {
        skipped += 1;
      }
      onProgress?.(embedded + skipped, assetIds.length);
    }
    // Purge (reclaim each touched owner's old image space) — only after a complete sweep, never on
    // abort. A no-op for an owner whose imageEmbed binding did not change since the last index.
    if (!signal.aborted) {
      await completeImageSweep(ctx, ownerId, receipts);
    }
    return { embedded, skipped };
  };
}

async function recordReceipt(ctx: EmbeddingsContext, assetId: AssetId, result: StoreResult | null, receipts: Map<UserId, StoreResult>): Promise<void> {
  if (result === null) {
    return;
  }
  const ownerId = await ctx.loadAssetOwner(assetId);
  if (ownerId === null) {
    return;
  }
  const prior = receipts.get(ownerId);
  if (prior !== undefined && prior.generationId !== result.generationId) {
    throw new GenerationSupersededError(ownerId, "image");
  }
  receipts.set(ownerId, result);
}

async function completeImageSweep(ctx: EmbeddingsContext, ownerId: UserId | null, receipts: ReadonlyMap<UserId, StoreResult>): Promise<void> {
  for (const [spaceOwnerId, receipt] of receipts) {
    const generation = await resolveTargetGeneration(ctx, spaceOwnerId, "imageEmbed", receipt.generationVia);
    if (generation !== null && generation.id === receipt.generationId && generation.epoch === receipt.generationEpoch) {
      await markGenerationComplete(ctx.db, { ownerId: spaceOwnerId, scope: "images", generation, now: ctx.now() });
    }
  }
  if (ownerId !== null && !receipts.has(ownerId)) {
    const emptySpace = await resolveImageSpace(ctx, ownerId);
    const generation = emptySpace === null ? null : await resolveTargetGeneration(ctx, ownerId, "imageEmbed", emptySpace.via);
    if (generation !== null) {
      await markGenerationComplete(ctx.db, { ownerId, scope: "images", generation, now: ctx.now() });
    }
  }
}
