// Refuse a foreign or absent asset before its private bytes ever reach the card parser or import effects.
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportOwnedAsset, OwnedAssetImportDeps } from "../contract/import-owned.ts";

export function createImportOwnedAsset<T>(deps: OwnedAssetImportDeps<T>): ImportOwnedAsset<T> {
  return async ({ installerUserId, assetId, pluginId }): Promise<T> => {
    const principal = await deps.resolvePrincipal(installerUserId);
    const owned = await deps.readOwnedAssetBytes(principal, castId<AssetId>(assetId));
    return deps.importBytes(installerUserId, owned.bytes, pluginId);
  };
}
