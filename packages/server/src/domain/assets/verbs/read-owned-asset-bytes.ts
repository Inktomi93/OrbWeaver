// verb: readOwnedAssetBytes — the OWNER-GATED byte read (EC-B, the ONE shared mint). Returns the CALLER'S OWN
// asset bytes + stored mime by id. THROWS AssetNotFoundError when the id is missing OR isn't the caller's (the
// two collapse — no foreign-existence leak, the D21 posture the gallery mutations already take). This is NOT
// `loadAssetBytes`: that is the deliberately un-principal'd embeddings-indexer re-read (D20, no owner gate).
// Consumed at compose by imagery (caption source + editImage source), expressions E4 (sheet re-read), rpg
// RC-D, and databank — every one an owner-scoped read of an asset the acting Principal owns.

import type { Principal } from "@orb/contracts/identity";
import type { AssetId } from "@orb/kit/ids";
import type { AssetsContext } from "../context.ts";
import { AssetNotFoundError } from "../contract/errors.ts";
import type { OwnedAssetBytes } from "../contract/results.ts";
import type { AssetsService } from "../contract/service.ts";
import { ownedAssetCasRef } from "../persistence/queries.ts";

export function createReadOwnedAssetBytes(ctx: AssetsContext): AssetsService["readOwnedAssetBytes"] {
  return async (caller: Principal, assetId: AssetId): Promise<OwnedAssetBytes> => {
    const ref = await ownedAssetCasRef(ctx.db, caller.userId, assetId);
    if (ref === undefined) {
      throw new AssetNotFoundError(assetId);
    }
    return { bytes: await ctx.cas.read(caller.userId, ref.hash), mime: ref.mime };
  };
}
