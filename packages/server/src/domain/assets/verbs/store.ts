// verb: store — persist bytes to the owner's CAS + index row, then emit asset.created on a genuinely new
// asset (the indexer subscribes to embed the image; assets has zero knowledge of consumers). Delivery is
// in-process fire-and-forget for v1 (assumes single-replica); enforceMagic is the upload boundary's defense
// — the route passes true, trusted non-HTTP callers omit it.

import { DomainOperationError } from "@orb/kit/errors";
import type { AssetsContext } from "../context.ts";
import type { StoreParams } from "../contract/params.ts";
import type { AssetsService } from "../contract/service.ts";
import { storeBlob } from "../persistence/queries.ts";

export function createStore(ctx: AssetsContext): AssetsService["store"] {
  return async ({ principal, bytes, kind, mime, enforceMagic, maxBytes }: StoreParams) => {
    // Reject an over-cap blob before it reaches the CAS (defense in depth over the HTTP route's body cap).
    if (maxBytes !== undefined && bytes.byteLength > maxBytes) {
      throw new DomainOperationError("asset_too_large", `asset is ${bytes.byteLength} bytes, over the ${maxBytes}-byte cap`);
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
    // Emit only on a new asset — created:false is a dedup hit already emitted/indexed; re-emitting would re-embed.
    if (stored.created) {
      ctx.emit({ type: "asset.created", assetId: stored.assetId });
    }
    return stored;
  };
}
