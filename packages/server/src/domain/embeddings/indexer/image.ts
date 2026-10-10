// Avatar preparation is shared by event delivery and sweeps, before any caption or vector inference.
import { EMBEDDABLE_ASSET_KINDS } from "@orb/contracts/assets";
import type { AssetId, UserId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import type { AvatarAnalysis, StoreResult } from "../contract/results.ts";
import type { EmbeddingsService, PinnedGeneration, PinnedImageSpace } from "../contract/service.ts";
import { readImageAnalysis, saveImageAnalysis } from "../persistence/image-analysis.ts";
import { existingCaptionedRow, existingImageHash, existingImageSkip, insertImageSkip } from "../persistence/queries.ts";
import { resolveImageTargetGeneration } from "../substrate/generation.ts";
import { contentHash } from "../substrate/hash.ts";
import { imageBelowFloor } from "../substrate/image-admission.ts";
import { reportImageSpaceDegrade } from "../substrate/image-space-degrade.ts";

interface ImageIndexerDeps {
  readonly store: EmbeddingsService["store"];
  readonly analyze: (ownerId: UserId, bytes: Uint8Array) => Promise<AvatarAnalysis>;
}

interface ImageAnalysisCounterDeps {
  /** Whether this owner's analysis would reach a model at all; the analysis skips without a call when it would not. */
  readonly analysisCallsModel: (ownerId: UserId) => Promise<boolean>;
}

interface ImageSweepSpace extends PinnedImageSpace {
  readonly ownerId: UserId;
}

async function resolveImageSweepSpace(ctx: EmbeddingsContext, assetId: AssetId): Promise<ImageSweepSpace | null> {
  const ownerId = await ctx.loadAssetOwner(assetId);
  if (ownerId === null) {
    return null;
  }
  const resolved = await resolveImageTargetGeneration(ctx, ownerId);
  return resolved === null ? null : { ownerId, ...resolved };
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

function imageNoOp(generation: PinnedGeneration, hash: string): StoreResult {
  return {
    outcome: "noop",
    contentHash: hash,
    model: generation.space,
    generationId: generation.id,
    generationEpoch: generation.epoch,
    generationVia: generation.via,
  };
}

async function indexAsset(
  ctx: EmbeddingsContext,
  deps: ImageIndexerDeps,
  assetId: AssetId,
  options: { readonly force: boolean; readonly embedderChanged: boolean; readonly signal: AbortSignal | undefined; readonly resolved: ImageSweepSpace },
): Promise<StoreResult | null> {
  const { force, embedderChanged, signal, resolved } = options;
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
    return imageNoOp(generation, hash);
  }
  const raw =
    space.via === "embed"
      ? imageNoOp(generation, hash)
      : await deps.store({
          kind: "avatar",
          lens: "image-raw",
          ownerId,
          assetId,
          content: bytes,
          model,
          force,
          signal,
        });
  const retained = force && !embedderChanged ? undefined : await readImageAnalysis(ctx.db, ownerId, assetId, hash);
  const analysis = retained ?? (await deps.analyze(ownerId, bytes));
  if (analysis.caption.trim().length === 0) {
    return raw;
  }
  const analysisRevision =
    retained?.revision ?? (await saveImageAnalysis(ctx.db, { ownerId, assetId, generationId: generation.id, contentHash: hash, ...analysis, now: ctx.now() }));
  if (analysisRevision === undefined) {
    return null;
  }
  const captionedWrite = await deps.store({
    kind: "avatar",
    lens: "image-captioned",
    ownerId,
    assetId,
    content: bytes,
    caption: analysis.caption,
    analysisRevision,
    via: space.via,
    model,
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
    const key = `${assetId}:${resolved.generation.id}:${String(options.force === true)}:${String(options.embedderChanged === true)}`;
    const existing = inFlight.get(key);
    if (existing !== undefined) {
      return await existing;
    }
    const pending = indexAsset(ctx, deps, assetId, {
      force: options.force ?? false,
      embedderChanged: options.embedderChanged ?? false,
      signal: options.signal,
      resolved,
    });
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
 * every indexable asset with no skip record whose retained faceted analysis is missing or was
 * made from other bytes, or every indexable asset under explicit analysis `force` (not an embedder rebuild); none for an owner whose analysis would make no
 * call. Reads only. The stored asset hash is the CAS key, the sha-256 of the bytes, which is the hash the
 * analysis row records, so a re-upload under the same id is found without reading its bytes.
 */
export function createImageAnalysisCounter(ctx: EmbeddingsContext, deps: ImageAnalysisCounterDeps): EmbeddingsService["countAssetAnalysisCalls"] {
  return async ({ ownerId, force, embedderChanged }) => {
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
      const hash = await ctx.loadAssetHash(assetId);
      if ((force && embedderChanged !== true) || hash === null || (await readImageAnalysis(ctx.db, resolved.ownerId, assetId, hash)) === undefined) {
        calls += 1;
      }
    }
    return calls;
  };
}
