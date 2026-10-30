import type { ResolveHostPrincipalOp } from "@orb/contracts/identity";
import type { PluginAssetReadOps, ReadPluginBundleBytes, ReadPublishedPluginBundle } from "@orb/contracts/plugin";
import type { AssetsService } from "./service.ts";

export interface PluginAssetReadDeps {
  readonly assets: Pick<AssetsService, "readOwnedAssetBytes" | "loadAssetBytes" | "assetCasRefById">;
  readonly resolveOwnerPrincipal: ResolveHostPrincipalOp;
}
export interface PluginAssetReads {
  readonly read: PluginAssetReadOps["read"];
  readonly readBytes: ReadPluginBundleBytes;
  readonly readPublishedBundle: ReadPublishedPluginBundle;
}
