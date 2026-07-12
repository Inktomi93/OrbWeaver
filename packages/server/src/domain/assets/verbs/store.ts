// verb: store — persist bytes to the owner's CAS + index row (via the `storeBlob` coherence primitive),
// then EMIT `asset.created` on a genuinely new asset. Ownership is `principal.userId` (§7.1 — never a
// `users` read). The injected `newAssetId`/`now` keep it deterministic (no ambient `mintTypeId()`/
// `Date.now()`). `enforceMagic` is the upload boundary's defense (invariant #6) — the route passes `true`;
// trusted non-HTTP callers (DR rebuild, future import backfill) omit it.
//
// The emit is the asset → embeddings seam: the indexer subscribes to
// `asset.created` and embeds the image; assets has ZERO knowledge of who consumes it (the bus is wired at
// the composition root). Delivery is in-process fire-and-forget for v1 (RESOLVED PD-27; ASSUMES
// single-replica) — the embeddings `content_hash` catch-up sweep (PD-53) is the reliability backstop;
// a durable outbox is the multi-replica seam.

import { DomainOperationError } from "@orb/kit/errors";
import type { StoreParams } from "../contract/params";
import type { AssetsContext, AssetsService } from "../contract/service";
import { storeBlob } from "../persistence/queries";

export function createStore(ctx: AssetsContext): AssetsService["store"] {
  return async ({ principal, bytes, kind, mime, enforceMagic, maxBytes }: StoreParams) => {
    // PD-94 — reject an over-cap blob BEFORE it reaches the CAS. Defense in depth over the HTTP route's body
    // cap (a trusted non-HTTP caller may omit `maxBytes`; the upload/import paths pass it).
    if (maxBytes !== undefined && bytes.byteLength > maxBytes) {
      throw new DomainOperationError(
        "asset_too_large",
        `asset is ${bytes.byteLength} bytes, over the ${maxBytes}-byte cap`,
      );
    }
    const stored = await storeBlob(ctx.db, ctx.cas, {
      ownerId: principal.userId,
      bytes,
      kind,
      mime,
      candidateId: ctx.newAssetId(),
      now: ctx.now(),
      enforceMagic: enforceMagic ?? false,
    });
    // Emit ONLY on a new asset. `created:false` is a within-user dedup hit — the existing asset was already
    // emitted (and indexed); re-emitting would re-embed identical bytes. (In the coherent slice flow a new
    // row ⟺ a new blob ⟺ `created`; the orphan-blob edge is handled by DR rebuild — `rebuildFromTree`, PD-84.)
    if (stored.created) {
      ctx.emit({ type: "asset.created", assetId: stored.assetId });
    }
    return stored;
  };
}
