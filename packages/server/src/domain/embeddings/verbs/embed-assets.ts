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

import type { AssetId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import type { EmbedPassParams } from "../contract/params.ts";
import type { BulkEmbedResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { purgeStaleVectors } from "../persistence/clear.ts";
import { existingImageHash } from "../persistence/queries.ts";
import { contentHash } from "../substrate/hash.ts";

interface EmbedAssetsDeps {
  readonly store: EmbeddingsService["store"];
  readonly caption: (bytes: Uint8Array) => Promise<string>;
}

/** One asset's sweep step: hash pre-check (both lenses) → store raw → caption → store captioned. */
async function embedOneAsset(ctx: EmbeddingsContext, deps: EmbedAssetsDeps, assetId: AssetId, force: boolean): Promise<"embedded" | "skipped"> {
  const bytes = await ctx.loadAssetBytes(assetId);
  if (bytes === undefined) {
    return "skipped";
  }
  const model = ctx.roleClients.imageEmbedModel;
  // Both lenses share the bytes' hash — pre-check them so a current asset skips before the expensive
  // caption/summarize call ever runs.
  const hash = contentHash(bytes);
  const rawCurrent = (await existingImageHash(ctx.db, assetId, "image-raw", model)) === hash;
  const captionedCurrent = (await existingImageHash(ctx.db, assetId, "image-captioned", model)) === hash;
  if (!force && rawCurrent && captionedCurrent) {
    return "skipped";
  }
  const raw = await deps.store({
    kind: "avatar",
    lens: "image-raw",
    assetId,
    content: bytes,
    model,
    dim: ctx.imageEmbedDim,
    force,
  });
  const caption = await deps.caption(bytes);
  const captioned = await deps.store({
    kind: "avatar",
    lens: "image-captioned",
    assetId,
    content: bytes,
    caption,
    captionMeta: { model: ctx.roleClients.summarizerModel },
    model,
    dim: ctx.imageEmbedDim,
    force,
  });
  return raw.outcome === "written" || captioned.outcome === "written" ? "embedded" : "skipped";
}

export function createEmbedAssets(ctx: EmbeddingsContext, deps: EmbedAssetsDeps): EmbeddingsService["embedAssets"] {
  return async ({ force, signal, ownerId }: EmbedPassParams): Promise<BulkEmbedResult> => {
    let embedded = 0;
    let skipped = 0;
    // `ownerId` scopes the sweep to one owner; `null` = every owner.
    for (const assetId of await ctx.listImageAssetIds(ownerId)) {
      if (signal.aborted) {
        break; // cooperative abort between assets — every completed embed is durable + idempotent
      }
      // biome-ignore lint/performance/noAwaitInLoops: the sweep is sequential BY DESIGN (the backfillMemory precedent — parallel items would stampede the imageEmbed/summarize backends; the hash pre-check makes per-item cost cheap on resume).
      const outcome = await embedOneAsset(ctx, deps, assetId, force);
      if (outcome === "embedded") {
        embedded += 1;
      } else {
        skipped += 1;
      }
    }
    // PD-104 purge (reclaim the old image space) — only after a complete bulk sweep, never on abort or a
    // singular per-owner pass. A no-op unless the box image-embed model changed since the last index.
    if (ownerId === null && !signal.aborted) {
      await purgeStaleVectors(ctx.db, "image_embeddings", ctx.roleClients.imageEmbedModel);
    }
    return { embedded, skipped };
  };
}
