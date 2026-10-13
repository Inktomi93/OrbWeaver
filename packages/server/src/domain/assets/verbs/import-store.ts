// Imported PNG art has already been decoded by the card parser; retain its existing false-magic policy.
import type { Principal } from "@orb/contracts/identity";
import type { ImportAssetPort, StoreImportedAvatar } from "../contract/import-store.ts";

export function createImportAvatarStore(principal: Principal, store: ImportAssetPort["store"]): StoreImportedAvatar {
  return async ({ bytes, mime }): ReturnType<StoreImportedAvatar> => (await store({ principal, bytes, kind: "avatar", mime, enforceMagic: false })).assetId;
}
