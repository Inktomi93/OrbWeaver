// verb: embedAssets — the PD-53 bulk IMAGE catch-up sweep (the resumable `content_hash`-gated re-index pass
// the `embed-assets` workload drives). Enumerates every image asset (the injected un-principal
// `listImageAssetIds` — D20, mime-filtered at the source), re-reads each asset's CAS bytes
// (`loadAssetBytes`), and routes BOTH lenses through the ONE write path (the `store` verb, injected at
// `service.ts` per the domain-no-cross-verb gate): `image-raw`, then caption + `image-captioned` — the same
// pair the on-write `onAssetCreated` handler embeds. The caption generator is the indexer subsystem's
// `generateAvatarCaption`, injected as the `caption` dep at `service.ts` (domain-substrate-mediates-
// subsystems — a verb never reaches into `indexer/` directly), so the two paths can never drift.
//
// The caption is the EXPENSIVE half (a summarize call that runs BEFORE `store`'s internal gate could skip
// it), so the sweep pre-checks both lens rows against the bytes' hash HERE (persistence read + the same
// `contentHash` substrate `store` uses — both lenses of one asset share the bytes' hash by design): a
// fully-embedded asset is a pure two-read skip, no caption, no embed. `force` bypasses the pre-check AND
// threads into `store` (the deliberate full re-index). Cooperative abort BETWEEN assets; an embed failure
// PROPAGATES (the workload records it; the rerun's pre-check resumes the remainder).
//
// Counts: `embedded` = assets that landed at least one fresh lens row this run; `skipped` = both-lenses-
// current pre-check hits + assets whose row vanished between the enumeration and the read.

import type { AssetId } from "@orb/kit/ids";
import type { EmbedPassParams } from "../contract/params";
import type { BulkEmbedResult } from "../contract/results";
import type { EmbeddingsContext, EmbeddingsService } from "../contract/service";
import { existingImageHash } from "../persistence/queries";
import { contentHash } from "../substrate/hash";

// The service.ts-wired dep bundle (domain-no-cross-verb / domain-substrate-mediates-subsystems: the store
// verb + the indexer's caption generator arrive as injected shapes, never as direct verb/subsystem imports).
interface EmbedAssetsDeps {
  readonly store: EmbeddingsService["store"];
  readonly caption: (bytes: Uint8Array) => Promise<string>;
}

/** One asset's sweep step: hash pre-check (both lenses) → store raw → caption → store captioned. */
async function embedOneAsset(
  ctx: EmbeddingsContext,
  deps: EmbedAssetsDeps,
  assetId: AssetId,
  force: boolean,
): Promise<"embedded" | "skipped"> {
  const bytes = await ctx.loadAssetBytes(assetId);
  if (bytes === undefined) {
    return "skipped";
  }
  const model = ctx.roleClients.imageEmbedModel;
  // Both lenses share the bytes' hash (substrate/hash header) — pre-check them so a current asset skips
  // BEFORE the expensive caption/summarize call ever runs (store's own gate sits after captioning).
  const hash = contentHash(bytes);
  const rawCurrent = (await existingImageHash(ctx.db, assetId, "image-raw", model)) === hash;
  const captionedCurrent =
    (await existingImageHash(ctx.db, assetId, "image-captioned", model)) === hash;
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

export function createEmbedAssets(
  ctx: EmbeddingsContext,
  deps: EmbedAssetsDeps,
): EmbeddingsService["embedAssets"] {
  return async ({ force, signal, ownerId }: EmbedPassParams): Promise<BulkEmbedResult> => {
    let embedded = 0;
    let skipped = 0;
    // `ownerId` scopes the sweep to ONE owner (SINGULAR — embed MY assets); `null` = every owner (BULK).
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
    return { embedded, skipped };
  };
}
