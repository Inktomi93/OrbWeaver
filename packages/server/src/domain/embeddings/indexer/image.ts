// Avatar preparation is shared by event delivery and sweeps, before any caption or vector inference.
import { EMBEDDABLE_ASSET_KINDS } from "@orb/contracts/assets";
import type { AssetId, UserId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import type { AvatarAnalysis, StoreResult } from "../contract/results.ts";
import type { EmbeddingsService, PinnedGeneration } from "../contract/service.ts";
import { existingCaptionedRow, existingImageHash, existingImageSkip, insertImageSkip } from "../persistence/queries.ts";
import { resolveTargetGeneration } from "../substrate/generation.ts";
import { contentHash } from "../substrate/hash.ts";
import { imageBelowFloor } from "../substrate/image-admission.ts";
import { reportImageSpaceDegrade } from "../substrate/image-space-degrade.ts";
import { resolveImageSpace } from "../substrate/task-model.ts";

interface ImageIndexerDeps {
  readonly store: EmbeddingsService["store"];
  readonly analyze: (ownerId: UserId, bytes: Uint8Array) => Promise<AvatarAnalysis>;
}

interface ImageAnalysisCounterDeps {
  /** Whether this owner's analysis would reach a model at all; the analysis skips without a call when it would not. */
  readonly analysisCallsModel: (ownerId: UserId) => Promise<boolean>;
}

interface ImageSweepSpace {
  readonly ownerId: UserId;
  readonly space: NonNullable<Awaited<ReturnType<typeof resolveImageSpace>>>;
  readonly generation: PinnedGeneration;
}

async function resolveImageSweepSpace(ctx: EmbeddingsContext, assetId: AssetId): Promise<ImageSweepSpace | null> {
  const ownerId = await ctx.loadAssetOwner(assetId);
  if (ownerId === null) {
    return null;
  }
  const space = await resolveImageSpace(ctx, ownerId);
  if (space === null) {
    return null;
  }
  const generation = await resolveTargetGeneration(ctx, ownerId, "imageEmbed", space.via);
  return generation === null ? null : { ownerId, space, generation };
}

/** The image space an asset would be indexed into, or `null` when the indexer would not touch it at all: not an
 *  image, not an embeddable kind, or no image space for its owner. The indexer and the call count both ask this. */
async function indexableImageSpace(ctx: EmbeddingsContext, assetId: AssetId): Promise<ImageSweepSpace | null> {
  const mime = await ctx.loadAssetMime(assetId);
  if (mime === null || !mime.startsWith("image/")) {
    return null;
  }
  const kind = await ctx.loadAssetKind(assetId);
  if (kind === null || !EMBEDDABLE_ASSET_KINDS.some((allowed) => allowed === kind)) {
    return null;
  }
  return await resolveImageSweepSpace(ctx, assetId);
}

async function indexAsset(
  ctx: EmbeddingsContext,
  deps: ImageIndexerDeps,
  assetId: AssetId,
  options: { readonly force: boolean; readonly signal: AbortSignal | undefined; readonly resolved: ImageSweepSpace },
): Promise<StoreResult | null> {
  const { force, signal, resolved } = options;
  const bytes = await loadAdmittedAsset(ctx, assetId, force);
  if (bytes === null) {
    return null;
  }
  const { generation, ownerId, space } = resolved;
  const model = space.model;
  if (space.via === "embed") {
    reportImageSpaceDegrade(ownerId, model, space.degraded);
  }
  const hash = contentHash(bytes);
  const rawCurrent = space.via === "embed" || (await existingImageHash(ctx.db, assetId, "image-raw", generation.id)) === hash;
  const captioned = await existingCaptionedRow(ctx.db, assetId, generation.id);
  const captionedCurrent = captioned !== undefined && captioned.hash === hash && captioned.hasFacets;
  if (!force && rawCurrent && captionedCurrent) {
    return {
      outcome: "noop",
      contentHash: hash,
      model: generation.space,
      generationId: generation.id,
      generationEpoch: generation.epoch,
      generationVia: generation.via,
    };
  }
  const raw =
    space.via === "embed"
      ? ({ outcome: "noop" } as const)
      : await deps.store({
          kind: "avatar",
          lens: "image-raw",
          ownerId,
          assetId,
          content: bytes,
          model,
          dim: ctx.imageEmbedDim,
          force,
          signal,
        });
  const analysis = await deps.analyze(ownerId, bytes);
  const captionedWrite = await deps.store({
    kind: "avatar",
    lens: "image-captioned",
    ownerId,
    assetId,
    content: bytes,
    caption: analysis.caption,
    captionMeta: analysis.captionMeta,
    via: space.via,
    model,
    dim: ctx.imageEmbedDim,
    force,
    signal,
  });
  return raw.outcome === "written" ? raw : captionedWrite;
}

async function loadAdmittedAsset(ctx: EmbeddingsContext, assetId: AssetId, force: boolean): Promise<Uint8Array | null> {
  if (!force && (await existingImageSkip(ctx.db, assetId))) {
    return null;
  }
  const bytes = await ctx.loadAssetBytes(assetId);
  if (bytes === undefined) {
    return null;
  }
  const admission = imageBelowFloor(bytes);
  if (!admission.belowFloor) {
    return bytes;
  }
  await insertImageSkip(ctx.db, { assetId, reason: "below-dimension-floor", width: admission.width, height: admission.height, now: ctx.now() });
  return null;
}

/** Shared preparation for events and catch-up sweeps; caption work coalesces before it starts. */
export function createImageIndexer(ctx: EmbeddingsContext, deps: ImageIndexerDeps): EmbeddingsService["indexAsset"] {
  const inFlight = new Map<string, Promise<StoreResult | null>>();
  return async (assetId, options = {}) => {
    const resolved = await indexableImageSpace(ctx, assetId);
    if (resolved === null) {
      return null;
    }
    const key = `${assetId}:${resolved.generation.id}:${String(options.force === true)}`;
    const existing = inFlight.get(key);
    if (existing !== undefined) {
      return await existing;
    }
    const pending = indexAsset(ctx, deps, assetId, { force: options.force ?? false, signal: options.signal, resolved });
    inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      inFlight.delete(key);
    }
  };
}

/**
 * How many avatar analyses (one vision call each) an image sweep over `ownerId` (`null` = every owner) would make:
 * every indexable asset with no skip record whose faceted analysis for its target generation is missing or was
 * made from other bytes, or every indexable asset under `force`; none for an owner whose analysis would make no
 * call. Reads only. The stored asset hash is the CAS key, the sha-256 of the bytes, which is the hash the
 * analysis row records, so a re-upload under the same id is found without reading its bytes.
 */
export function createImageAnalysisCounter(ctx: EmbeddingsContext, deps: ImageAnalysisCounterDeps): EmbeddingsService["countAssetAnalysisCalls"] {
  return async ({ ownerId, force }) => {
    const callsModel = new Map<UserId, boolean>();
    const ownerCallsModel = async (owner: UserId): Promise<boolean> => {
      const reaches = callsModel.get(owner) ?? (await deps.analysisCallsModel(owner));
      callsModel.set(owner, reaches);
      return reaches;
    };
    let calls = 0;
    for (const assetId of await ctx.listImageAssetIds(ownerId)) {
      const resolved = await indexableImageSpace(ctx, assetId);
      if (resolved === null || (!force && (await existingImageSkip(ctx.db, assetId))) || !(await ownerCallsModel(resolved.ownerId))) {
        continue;
      }
      if (force || !(await analysisCurrent(ctx, assetId, resolved.generation.id))) {
        calls += 1;
      }
    }
    return calls;
  };
}

/** Whether the asset's faceted analysis for this generation was made from the bytes it holds now. */
async function analysisCurrent(ctx: EmbeddingsContext, assetId: AssetId, generationId: PinnedGeneration["id"]): Promise<boolean> {
  const captioned = await existingCaptionedRow(ctx.db, assetId, generationId);
  return captioned !== undefined && captioned.hasFacets && captioned.hash === (await ctx.loadAssetHash(assetId));
}
