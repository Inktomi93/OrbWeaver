import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { CharacterHandoffCopyContext } from "#domain/character";
import type { ChatContext } from "#domain/chat";
import type { AssetsService } from "./service.ts";
/** Asset ownership is checked before bytes are read and copied under the recipient's row-derived authority. */
export interface ChatAssetOpsDeps {
  readonly assets: Pick<AssetsService, "assetCasRefById" | "loadAssetBytes" | "store" | "resolveOwnedAssetRefs">;
  readonly resolvePrincipal: (userId: UserId) => Promise<Principal>;
}
export interface ChatAssetOps extends Pick<ChatContext, "resolveAssetHash" | "filterOwnedAssetIds"> {
  readonly copyAsset: CharacterHandoffCopyContext["copyAsset"];
}
