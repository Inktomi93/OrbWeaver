import type { OwnedAssetBytes } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, PluginId, UserId } from "@orb/kit/ids";

export interface OwnedAssetImportDeps<T> {
  readonly resolvePrincipal: (userId: UserId) => Promise<Principal>;
  readonly readOwnedAssetBytes: (principal: Principal, assetId: AssetId) => Promise<OwnedAssetBytes>;
  readonly importBytes: (installerUserId: UserId, bytes: Uint8Array, pluginId: PluginId | null) => Promise<T>;
}
export interface OwnedAssetImportRequest {
  readonly installerUserId: UserId;
  readonly assetId: string;
  readonly pluginId: PluginId | null;
}
export type ImportOwnedAsset<T> = (request: OwnedAssetImportRequest) => Promise<T>;
