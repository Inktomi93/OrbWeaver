import type { StoredAsset, StoreParams } from "@orb/contracts/assets";
import type { AssetsService } from "./service.ts";

export interface BackgroundStoreDeps {
  readonly store: AssetsService["store"];
  readonly maxBytes?: () => number;
}

export type BackgroundStoreParams = Pick<StoreParams, "principal" | "bytes" | "mime">;
export type StoreBackground = (params: BackgroundStoreParams) => Promise<StoredAsset>;
