// domain/assets — composition root: wires the verbs over the DI bundle (zero logic). Injects no guard
// (every surface is ownership-scoped off principal.userId, never admin/owner-gated). Maintenance/DR verbs
// (backfillAvatars, collectGarbage, reapIfOrphan, fsck, rebuildFromTree) run over the asset-ref registry
// (persistence/asset-refs.ts — the one list of asset-bearing columns, coverage proven by a schema-
// introspection test) so a new asset-bearing FK cannot silently become GC-eligible.

import type { AssetsContext } from "./context.ts";
import type { AssetsService } from "./contract/service.ts";
import { createAddToGallery } from "./verbs/add-to-gallery.ts";
import { createAssetCasRefById } from "./verbs/asset-cas-ref-by-id.ts";
import { createBackfillAvatars } from "./verbs/backfill-avatars.ts";
import { createCollectGarbage } from "./verbs/collect-garbage.ts";
import { createFsck } from "./verbs/fsck.ts";
import { createGetMetadata } from "./verbs/get-metadata.ts";
import { createListGallery } from "./verbs/list-gallery.ts";
import { createListImageAssetIds } from "./verbs/list-image-asset-ids.ts";
import { createListOwned } from "./verbs/list-owned.ts";
import { createLoadAssetBytes } from "./verbs/load-asset-bytes.ts";
import { createReadOwnedAssetBytes } from "./verbs/read-owned-asset-bytes.ts";
import { createReapIfOrphan } from "./verbs/reap-if-orphan.ts";
import { createRebuildFromTree } from "./verbs/rebuild-from-tree.ts";
import { createRemoveFromGallery } from "./verbs/remove-from-gallery.ts";
import { createResolveChatAssetRefs } from "./verbs/resolve-chat-asset-refs.ts";
import { createResolveOwnedAssetRefs } from "./verbs/resolve-owned-asset-refs.ts";
import { createResolveVariant } from "./verbs/resolve-variant.ts";
import { createStore } from "./verbs/store.ts";

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
