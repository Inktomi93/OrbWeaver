import type { ChatAssetOps, ChatAssetOpsDeps } from "../contract/chat-asset-ops.ts";
/** Bind asset copying and reference projections without widening the source owner's scope. */
export function createChatAssetOps(deps: ChatAssetOpsDeps): ChatAssetOps {
  return {
    copyAsset: async ({ fromOwnerId, toOwnerId, assetId, kind }): ReturnType<ChatAssetOps["copyAsset"]> => {
      const ref = await deps.assets.assetCasRefById(assetId);
      if (ref === undefined || ref.ownerId !== fromOwnerId) {
        return null;
      }
      const bytes = await deps.assets.loadAssetBytes(assetId);
      if (bytes === null) {
        return null;
      }
      const stored = await deps.assets.store({
        principal: await deps.resolvePrincipal(toOwnerId),
        bytes,
        kind,
        mime: ref.mime,
      });
      return stored.assetId;
    },
    resolveAssetHash: async (assetId): ReturnType<ChatAssetOps["resolveAssetHash"]> => {
      if (assetId === null) {
        return null;
      }
      const ref = await deps.assets.assetCasRefById(assetId);
      return ref?.hash ?? null;
    },
    // Owner-scoped: a foreign/gone id is simply absent from the result.
    filterOwnedAssetIds: async (userId, assetIds) => (await deps.assets.resolveOwnedAssetRefs(userId, assetIds)).map((r) => r.assetId),
  };
}
