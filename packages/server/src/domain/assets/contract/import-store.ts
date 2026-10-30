import type { StoreAvatarAsset, StoreParams } from "@orb/contracts/assets";
import type { AssetId } from "@orb/kit/ids";

export interface ImportAssetPort {
  readonly store: StoreAvatarAsset;
}
export type StoreImportedAvatar = (params: Pick<StoreParams, "bytes" | "mime">) => Promise<AssetId>;
