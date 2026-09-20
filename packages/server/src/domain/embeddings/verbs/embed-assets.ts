// The bulk image catch-up sweep — a resumable, content_hash-gated re-index pass. Enumerates every image
// asset, re-reads its CAS bytes, and routes both lenses through the store verb: image-raw, then caption +
// image-captioned — the same pair the on-write `onAssetCreated` handler embeds.
//
// The caption is the expensive half, so the sweep pre-checks both lens rows against the bytes' hash before
// captioning: a fully-embedded asset is a pure two-read skip. `force` bypasses the pre-check and threads
// into `store`. Cooperative abort between assets; an embed failure propagates.
//
// PD-104 — the REINDEX half of purge+reindex for the image space (mirrors embed-corpus). After a complete
// BULK sweep re-embeds every asset (both lenses) into the box's active `(model, dim)` image space, it
// PURGES `image_embeddings` rows in any OTHER space. BULK-ONLY (ownerId === null); skipped on abort so the
// space is never left with a gap. A no-op unless the box image-embed model changed.

import type { AssetId, UserId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import type { EmbedPassParams } from "../contract/params.ts";
// `AvatarAnalysis` is the SHAPE of the injected analysis op, taken from the domain's contract/; the runtime
// function (`indexer/caption.ts`) is wired at `service.ts` and never imported across the subsystem seam.
import type { AvatarAnalysis, BulkEmbedResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { purgeStaleVectors } from "../persistence/clear.ts";
import { existingCaptionedRow, existingImageHash, existingImageSkip, insertImageSkip } from "../persistence/queries.ts";
import { contentHash } from "../substrate/hash.ts";
import { imageBelowFloor } from "../substrate/image-admission.ts";
import { requireTaskModel } from "../substrate/task-model.ts";

interface EmbedAssetsDeps {
  readonly store: EmbeddingsService["store"];
  readonly analyze: (ownerId: UserId, bytes: Uint8Array) => Promise<AvatarAnalysis>;
}

/** One asset's sweep step: hash + breakdown pre-check (both lenses) → store raw → analyse → store captioned. */
async function embedOneAsset(ctx: EmbeddingsContext, deps: EmbedAssetsDeps, assetId: AssetId, force: boolean, spaces: Map<UserId, string>): Promise<"embedded" | "skipped"> {
  // ADMISSION FLOOR (recorded skip, read FIRST): an asset already refused by the dimension floor is honored
  // here — no byte load, no caption, no embed — so a re-index does not re-attempt it. `force` still bypasses
  // it (a deliberate re-index of everything), mirroring how `force` bypasses the hash/facet pre-check below.
  if (!force && (await existingImageSkip(ctx.db, assetId))) {
    return "skipped";
  }
  const bytes = await ctx.loadAssetBytes(assetId);
  if (bytes === undefined) {
    return "skipped";
  }
  // ADMISSION FLOOR (dimension gate): a degenerate asset carries no visual signal — record the refusal
  // (visible + idempotent) and skip BEFORE the expensive caption + image-embed calls.
  const admission = imageBelowFloor(bytes);
  if (admission.belowFloor) {
    await insertImageSkip(ctx.db, { assetId, reason: "below-dimension-floor", width: admission.width, height: admission.height, now: ctx.now() });
    return "skipped";
  }
  const ownerId = await ctx.loadAssetOwner(assetId);
  const model = ownerId === null ? null : await requireTaskModel(ctx, ownerId, "imageEmbed");
  if (ownerId === null || model === null) {
    return "skipped"; // no owner / no imageEmbed binding — nothing funds the embed (§7.5-2)
  }
  spaces.set(ownerId, model);
  // Both lenses share the bytes' hash — pre-check them so a current asset skips before the expensive
  // analysis call ever runs.
  const hash = contentHash(bytes);
  const rawCurrent = (await existingImageHash(ctx.db, assetId, "image-raw", model)) === hash;
  // THE CAPTIONED LENS NEEDS TWO CONDITIONS, not one (issue #164). Every row written before 2026-08-18 has a
  // matching bytes hash and a `caption_meta` of `{model}` — no facet breakdown at all — so a hash-only
  // pre-check declares the whole pre-existing corpus current and the facet columns stay empty forever. The
  // facet-presence half is what makes `index {source:"image"}` a RESUMABLE facet backfill: it re-analyses
  // exactly the facetless rows and skips everything already broken down, with no `force` (which would
  // needlessly re-embed both lenses for every asset on the box).
  const captioned = await existingCaptionedRow(ctx.db, assetId, model);
  const captionedCurrent = captioned !== undefined && captioned.hash === hash && captioned.hasFacets;
  if (!force && rawCurrent && captionedCurrent) {
    return "skipped";
  }
  const raw = await deps.store({
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
    model,
    dim: ctx.imageEmbedDim,
    force,
  });
  return raw.outcome === "written" || captionedWrite.outcome === "written" ? "embedded" : "skipped";
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
    const spaces = new Map<UserId, string>();
    for (const assetId of assetIds) {
      if (signal.aborted) {
        break; // cooperative abort between assets — every completed embed is durable + idempotent
      }
      const outcome = await embedOneAsset(ctx, deps, assetId, force, spaces);
      if (outcome === "embedded") {
        embedded += 1;
      } else {
        skipped += 1;
      }
      onProgress?.(embedded + skipped, assetIds.length);
    }
    // PD-104 purge (reclaim each touched owner's old image space) — only after a complete sweep, never on
    // abort. A no-op for an owner whose imageEmbed binding did not change since the last index.
    if (!signal.aborted) {
      for (const [spaceOwnerId, model] of spaces) {
        await purgeStaleVectors(ctx.db, "image_embeddings", spaceOwnerId, model);
      }
    }
    return { embedded, skipped };
  };
}
