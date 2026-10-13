import type { StoreAsset, StoredAsset, StoreParams } from "@orb/contracts/assets";

export interface BackgroundStoreDeps {
  readonly store: StoreAsset;
  readonly maxBytes?: () => number;
}

export type BackgroundStoreParams = Pick<StoreParams, "principal" | "bytes" | "mime">;
export type StoreBackground = (params: BackgroundStoreParams) => Promise<StoredAsset>;
