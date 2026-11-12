// verb: store — persist bytes to the owner's CAS + index row, then emit asset.created on a new asset or a first
// embeddable use (the indexer subscribes to embed the image; assets has zero knowledge of consumers). Delivery is
// in-process fire-and-forget for v1 (assumes single-replica); enforceMagic is the upload boundary's defense
// — the route passes true, trusted non-HTTP callers omit it.

import type { AssetKind } from "@orb/contracts/assets";
import { ASSET_UPLOAD_REFUSAL_CODES, EMBEDDABLE_ASSET_KINDS } from "@orb/contracts/assets";
import { DomainOperationError } from "@orb/kit/errors";
import type { StoreParams } from "../contract/params.ts";
import type { AssetsContext, AssetsService } from "../contract/service.ts";
import { storeBlob } from "../persistence/queries.ts";

const EMBEDDABLE_KINDS: readonly AssetKind[] = EMBEDDABLE_ASSET_KINDS;

export function createStore(ctx: AssetsContext): AssetsService["store"] {
  return async ({ principal, bytes, kind, mime, enforceMagic, maxBytes }: StoreParams) => {
    // Reject an over-cap blob before it reaches the CAS (defense in depth over the HTTP route's body cap).
    if (maxBytes !== undefined && bytes.byteLength > maxBytes) {
      throw new DomainOperationError(ASSET_UPLOAD_REFUSAL_CODES.tooLarge, `asset is ${bytes.byteLength} bytes, over the ${maxBytes}-byte cap`);
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
    // Emit on a new asset, and on bytes already held that this call first stored under an embeddable kind: the indexer
    // skipped them while they held no such kind. Any other dedup hit is already indexed, and re-emitting would re-embed.
    if (stored.created || (stored.kindAdded && EMBEDDABLE_KINDS.includes(kind))) {
      ctx.emit({ type: "asset.created", assetId: stored.assetId });
    }
    return { assetId: stored.assetId, hash: stored.hash, created: stored.created };
  };
}
