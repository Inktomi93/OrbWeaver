import type { Principal } from "@orb/contracts/identity";
import type { PluginAssetReadOps, ReadPluginBundleBytes, ReadPublishedPluginBundle } from "@orb/contracts/plugin";
import type { UserId } from "@orb/kit/ids";
import type { AssetsService } from "./service.ts";

export interface PluginAssetReadDeps {
  readonly assets: Pick<AssetsService, "readOwnedAssetBytes" | "loadAssetBytes" | "assetCasRefById">;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
}
export interface PluginAssetReads {
  readonly read: PluginAssetReadOps["read"];
  readonly readBytes: ReadPluginBundleBytes;
  readonly readPublishedBundle: ReadPublishedPluginBundle;
}
