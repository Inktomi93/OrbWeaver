import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { ImportOwnedAsset, OwnedAssetImportDeps } from "../contract/import-owned.ts";

export function createImportOwnedAsset<T>(deps: OwnedAssetImportDeps<T>): ImportOwnedAsset<T> {
  return async ({ installerUserId, assetId, pluginId }): Promise<T> => {
    const principal = await deps.resolvePrincipal(installerUserId);
    const owned = await deps.readOwnedAssetBytes(principal, typeIdSchema(ID_PREFIX.asset).parse(assetId));
    return deps.importBytes(installerUserId, owned.bytes, pluginId);
  };
}
