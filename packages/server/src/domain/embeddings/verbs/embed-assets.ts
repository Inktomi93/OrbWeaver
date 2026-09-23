// The bulk image catch-up sweep — a resumable, content_hash-gated re-index pass. Enumerates every image
// asset, re-reads its CAS bytes, and routes both lenses through the store verb: image-raw, then caption +
// image-captioned — the same pair the on-write `onAssetCreated` handler embeds.
//
// The caption is the expensive half, so the sweep pre-checks both lens rows against the bytes' hash before
// captioning: a fully-embedded asset is a pure two-read skip. `force` bypasses the pre-check and threads
// into `store`. Cooperative abort between assets; an embed failure propagates.
//
// The REINDEX half of purge+reindex for the image space (mirrors embed-corpus). After a complete
// BULK sweep re-embeds every asset into the owner's active image `(model, dim)` space, it RECORDS the
// completion (`embed_space_state`, scope `images` — §10-5) and then PURGES `image_embeddings` rows in any
// OTHER space. BULK-ONLY (ownerId === null); skipped on abort so the space is never left with a gap.
//
// §10-3 — WHICH space an owner's images go into is the JOINT-SPACE RULE's answer, not a bare `imageEmbed`
// resolve. An owner with no image-capable embedder gets the CAPTIONED-TEXT arm: the raw lens is skipped
// (nothing can embed pixels for them) and the caption is embedded as text into their `embed` space, so the
// picture is still findable. Before this an unbound `imageEmbed` dropped every asset behind a debug line.

import type { AssetId, UserId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import type { EmbedPassParams } from "../contract/params.ts";
// `AvatarAnalysis` is the SHAPE of the injected analysis op, taken from the domain's contract/; the runtime
// function (`indexer/caption.ts`) is wired at `service.ts` and never imported across the subsystem seam.
import type { AvatarAnalysis, BulkEmbedResult, StoreResult } from "../contract/results.ts";
import type { EmbeddingsService, PinnedGeneration } from "../contract/service.ts";
import { existingCaptionedRow, existingImageHash, existingImageSkip, insertImageSkip } from "../persistence/queries.ts";
import { markGenerationComplete } from "../persistence/space-state.ts";
import { resolveTargetGeneration } from "../substrate/generation.ts";
import { contentHash } from "../substrate/hash.ts";
import { imageBelowFloor } from "../substrate/image-admission.ts";
import { reportImageSpaceDegrade } from "../substrate/image-space-degrade.ts";
import { resolveImageSpace } from "../substrate/task-model.ts";

interface EmbedAssetsDeps {
  readonly store: EmbeddingsService["store"];
  readonly analyze: (ownerId: UserId, bytes: Uint8Array) => Promise<AvatarAnalysis>;
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

/** One asset's sweep step: hash + breakdown pre-check (both lenses) → store raw → analyse → store captioned. */
async function embedOneAsset(
  ctx: EmbeddingsContext,
  deps: EmbedAssetsDeps,
  assetId: AssetId,
  sweep: { readonly force: boolean; readonly receipts: Map<UserId, StoreResult> },
): Promise<"embedded" | "skipped"> {
  const { force } = sweep;
  // ADMISSION FLOOR (recorded skip, read FIRST): an asset already refused by the dimension floor is honored
  // here — no byte load, no caption, no embed — so a re-index does not re-attempt it. `force` still bypasses
  // it (a deliberate re-index of everything), mirroring how `force` bypasses the hash/facet pre-check below.
  const bytes = await loadAdmittedAsset(ctx, assetId, force);
  if (bytes === null) {
    return "skipped";
  }
  // THE JOINT-SPACE RULE (§10-3), identical to the on-write handler's: the owner's images go into their
  // image space when they have an image-capable embedder, else into their TEXT space by the caption alone.
  // Only an owner with no vector connection at all is skipped — an unbound `imageEmbed` used to lose every
  // picture here silently.
  const resolved = await resolveImageSweepSpace(ctx, assetId);
  if (resolved === null) {
    return "skipped"; // no owner / no vector connection at all — nothing funds the embed (§7.5-2)
  }
  const { generation, ownerId, space } = resolved;
  const model = space.model;
  if (space.via === "embed") {
    reportImageSpaceDegrade(ownerId, model, space.degraded);
  }
  // Both lenses share the bytes' hash — pre-check them so a current asset skips before the expensive
  // analysis call ever runs.
  const hash = contentHash(bytes);
  // The raw lens does not exist in the captioned-text arm (nothing there can embed pixels), so it is
  // vacuously current — never a reason to re-run the expensive analysis, and never a store call.
  const rawCurrent = space.via === "embed" || (await existingImageHash(ctx.db, assetId, "image-raw", generation.id)) === hash;
  // THE CAPTIONED LENS NEEDS TWO CONDITIONS, not one (issue #164). Every row written before 2026-08-18 has a
  // matching bytes hash and a `caption_meta` of `{model}` — no facet breakdown at all — so a hash-only
  // pre-check declares the whole pre-existing corpus current and the facet columns stay empty forever. The
  // facet-presence half is what makes `index {source:"image"}` a RESUMABLE facet backfill: it re-analyses
  // exactly the facetless rows and skips everything already broken down, with no `force` (which would
  // needlessly re-embed both lenses for every asset on the box).
  const captioned = await existingCaptionedRow(ctx.db, assetId, generation.id);
  const captionedCurrent = captioned !== undefined && captioned.hash === hash && captioned.hasFacets;
  if (!force && rawCurrent && captionedCurrent) {
    return "skipped";
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
  });
  const receipt = raw.outcome === "written" ? raw : captionedWrite;
  const prior = sweep.receipts.get(ownerId);
  if (prior !== undefined && prior.generationId !== receipt.generationId) {
    throw new Error(`embedding generation changed during image sweep for owner ${ownerId}`);
  }
  sweep.receipts.set(ownerId, receipt);
  return raw.outcome === "written" || captionedWrite.outcome === "written" ? "embedded" : "skipped";
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

export function createEmbedAssets(ctx: EmbeddingsContext, deps: EmbedAssetsDeps): EmbeddingsService["embedAssets"] {
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
      const outcome = await embedOneAsset(ctx, deps, assetId, { force, receipts });
      if (outcome === "embedded") {
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
