import type { StoredAsset } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { AssetsService } from "./service.ts";

export interface GeneratedStoreDeps {
  readonly store: AssetsService["store"];
  readonly resolvePrincipal: (ownerId: UserId) => Promise<Principal>;
  readonly maxBytes: () => number;
}
export type StoreGeneratedImage = (ownerId: UserId, bytes: Uint8Array, mime: string) => Promise<StoredAsset>;
