// domain/assets — composition root: wires the verbs over the DI bundle (zero logic). Injects no guard
// (every surface is ownership-scoped off principal.userId, never admin/owner-gated). Maintenance/DR verbs
// (backfillAvatars, collectGarbage, reapIfOrphan, fsck, rebuildFromTree) run over the asset-ref registry
// (persistence/asset-refs.ts — the one list of asset-bearing columns, coverage proven by a schema-
// introspection test) so a new asset-bearing FK cannot silently become GC-eligible.

import type { AssetsContext } from "./context";
import type { AssetsService } from "./contract/service";
import { createAddToGallery } from "./verbs/add-to-gallery";
import { createAssetCasRefById } from "./verbs/asset-cas-ref-by-id";
import { createBackfillAvatars } from "./verbs/backfill-avatars";
import { createCollectGarbage } from "./verbs/collect-garbage";
import { createFsck } from "./verbs/fsck";
import { createGetMetadata } from "./verbs/get-metadata";
import { createListGallery } from "./verbs/list-gallery";
import { createListImageAssetIds } from "./verbs/list-image-asset-ids";
import { createListOwned } from "./verbs/list-owned";
import { createLoadAssetBytes } from "./verbs/load-asset-bytes";
import { createReadOwnedAssetBytes } from "./verbs/read-owned-asset-bytes";
import { createReapIfOrphan } from "./verbs/reap-if-orphan";
import { createRebuildFromTree } from "./verbs/rebuild-from-tree";
import { createRemoveFromGallery } from "./verbs/remove-from-gallery";
import { createResolveChatAssetRefs } from "./verbs/resolve-chat-asset-refs";
import { createResolveOwnedAssetRefs } from "./verbs/resolve-owned-asset-refs";
import { createResolveVariant } from "./verbs/resolve-variant";
import { createStore } from "./verbs/store";

export function createAssetsService(ctx: AssetsContext): AssetsService {
  return {
    store: createStore(ctx),
    getMetadata: createGetMetadata(ctx),
    resolveVariant: createResolveVariant(ctx),
    loadAssetBytes: createLoadAssetBytes(ctx),
    readOwnedAssetBytes: createReadOwnedAssetBytes(ctx),
    assetCasRefById: createAssetCasRefById(ctx),
    listImageAssetIds: createListImageAssetIds(ctx),
    listOwned: createListOwned(ctx),
    addToGallery: createAddToGallery(ctx),
    removeFromGallery: createRemoveFromGallery(ctx),
    listGallery: createListGallery(ctx),
    resolveOwnedAssetRefs: createResolveOwnedAssetRefs(ctx),
    resolveChatAssetRefs: createResolveChatAssetRefs(ctx),
    backfillAvatars: createBackfillAvatars(ctx),
    collectGarbage: createCollectGarbage(ctx),
    reapIfOrphan: createReapIfOrphan(ctx),
    fsck: createFsck(ctx),
    rebuildFromTree: createRebuildFromTree(ctx),
  };
}
