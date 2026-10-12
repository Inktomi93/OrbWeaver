import type { CopyAssetToOwner, FilterOwnedAssetIdsOp, ResolveAssetHashOp } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { AssetsService } from "./service.ts";

/** Asset ownership is checked before bytes are read and copied under the recipient's row-derived authority. */

export interface ChatAssetOpsDeps {
  readonly assets: Pick<AssetsService, "assetCasRefById" | "loadAssetBytes" | "store" | "resolveOwnedAssetRefs">;
  readonly resolvePrincipal: (userId: UserId) => Promise<Principal>;
}
export interface ChatAssetOps {
  readonly resolveAssetHash: ResolveAssetHashOp;
  readonly filterOwnedAssetIds: FilterOwnedAssetIdsOp;
  readonly copyAsset: CopyAssetToOwner;
}
