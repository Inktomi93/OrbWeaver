// The catch-up sweep shares avatar preparation with event delivery and records completed generations.

import type { EmbedPassResult, StoreResult } from "@orb/contracts/embeddings";
import type { AssetId, UserId } from "@orb/kit/ids";
import { GenerationSupersededError } from "#primitives/embedding-generation";
import { AssetFileCorruptError, AssetFileMissingError } from "../contract/errors.ts";
import type { EmbedPassParams } from "../contract/params.ts";
import type { EmbeddingsContext, EmbeddingsService } from "../contract/service.ts";
import { completeGenerationScope, resolveImageTargetGeneration } from "../substrate/generation.ts";

const ASSET_OUTCOMES = ["written", "skipped", "failed"] as const;
type AssetOutcome = (typeof ASSET_OUTCOMES)[number];

interface Sweep {
  readonly ctx: EmbeddingsContext;
  readonly deps: Pick<EmbeddingsService, "indexAsset">;
  readonly receipts: Map<UserId, StoreResult>;
  /** The sweep's enabled read, resolved once per owner. */
  readonly ownerEnabled: (ownerId: UserId) => Promise<boolean>;
}

// A stored file gone or not an image while its asset row remains fails that asset alone; every other error still stops the sweep.
// A disabled owner's asset is skipped before its space resolves, so neither the caption nor the vector is spent, as for a
// departed account; it stays un-indexed, so the next sweep indexes it.
async function indexOne(sweep: Sweep, assetId: AssetId, options: Pick<EmbedPassParams, "force" | "signal" | "embedderChanged">): Promise<AssetOutcome> {
  const ownerId = await sweep.ctx.loadAssetOwner(assetId);
  if (ownerId !== null && !(await sweep.ownerEnabled(ownerId))) {
    return "skipped";
  }
  try {
    const result = await sweep.deps.indexAsset(assetId, options);
    recordReceipt(ownerId, result, sweep.receipts);
    return result?.outcome === "written" ? "written" : "skipped";
  } catch (error) {
    if (!(error instanceof AssetFileMissingError || error instanceof AssetFileCorruptError)) {
      throw error;
    }
    return "failed";
  }
}

export function createEmbedAssets(ctx: EmbeddingsContext, deps: Pick<EmbeddingsService, "indexAsset">): EmbeddingsService["embedAssets"] {
  return async ({ force, signal, ownerId, onProgress, embedderChanged }: EmbedPassParams): Promise<EmbedPassResult> => {
    let embedded = 0;
    let skipped = 0;
    const failedAssets: AssetId[] = [];
    // `ownerId` scopes the sweep to one owner; `null` = every owner. The enumeration is materialised BEFORE
    // the loop because it is also the progress DENOMINATOR — the workload wrapper around this pass cannot
    // know it (a sweep that only ever reported a sentence left the card an indeterminate bar
    // through a 350-image run).
    const assetIds = await ctx.listImageAssetIds(ownerId);
    // Every owner the sweep resolved, with the image space it embedded into — the purge set.
    const receipts = new Map<UserId, StoreResult>();
    const enabled = new Map<UserId, Promise<boolean>>();
    const ownerEnabled = (assetOwnerId: UserId): Promise<boolean> => enabled.getOrInsertComputed(assetOwnerId, () => ctx.isAccountEnabled(assetOwnerId));
    for (const assetId of assetIds) {
      if (signal.aborted) {
        break; // cooperative abort between assets — every completed embed is durable + idempotent
      }
      const outcome = await indexOne({ ctx, deps, receipts, ownerEnabled }, assetId, { force, signal, embedderChanged });
      if (outcome === "failed") {
        failedAssets.push(assetId);
      } else if (outcome === "written") {
        embedded += 1;
      } else {
        skipped += 1;
      }
      onProgress?.(embedded + skipped + failedAssets.length, assetIds.length);
    }
    // Purge (reclaim each touched owner's old image space) — only after a complete sweep, never on
    // abort. A no-op for an owner whose imageEmbed binding did not change since the last index.
    if (!signal.aborted) {
      await completeImageSweep(ctx, ownerId, receipts);
    }
    return failedAssets.length === 0 ? { embedded, skipped } : { embedded, skipped, failedAssets };
  };
}

function recordReceipt(ownerId: UserId | null, result: StoreResult | null, receipts: Map<UserId, StoreResult>): void {
  if (result === null || ownerId === null) {
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
    const resolved = await resolveImageTargetGeneration(ctx, spaceOwnerId);
    const generation = resolved?.generation;
    if (generation !== undefined && generation.id === receipt.generationId && generation.epoch === receipt.generationEpoch) {
      await completeGenerationScope(ctx, { ownerId: spaceOwnerId, scope: "images", generation });
    }
  }
  if (ownerId !== null && !receipts.has(ownerId)) {
    const resolved = await resolveImageTargetGeneration(ctx, ownerId);
    if (resolved !== null) {
      await completeGenerationScope(ctx, { ownerId, scope: "images", generation: resolved.generation });
    }
  }
}
