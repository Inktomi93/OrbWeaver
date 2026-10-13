import type { StoredAsset, StoreParams } from "@orb/contracts/assets";
import type { AssetId } from "@orb/kit/ids";

/** Narrow return data, derived from the assets producer; params retain its genuine byte/admission controls. */
export interface ImportAssetPort {
  readonly store: (params: StoreParams & { readonly kind: "avatar" }) => Promise<Pick<StoredAsset, "assetId">>;
}
export type StoreImportedAvatar = (params: Pick<StoreParams, "bytes" | "mime">) => Promise<AssetId>;
