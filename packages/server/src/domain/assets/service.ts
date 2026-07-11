// domain/assets — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The per-user
// content-addressed asset store's core path (4c W1): `store` (+ the `asset.created` emit), `getMetadata`
// (the owner-gated blob-serve gate), `resolveVariant` (the snap → cache → transform pipeline). The
// `AssetsContext` is assembled at the entry root (db + the injected clock/id determinism seam + the infra
// `cas`/`variants`/`imageTransform` handles + the `emit` event op) and passed in; assets injects NO guard
// (every surface is ownership-scoped off `principal.userId`, not admin/owner-gated — D21).
//
// The maintenance/DR wave (PD-26 + PD-84) is BUILT: `backfillAvatars`, `collectGarbage`, `reapIfOrphan`,
// `fsck`, `rebuildFromTree`, over the asset-ref registry (`persistence/asset-refs.ts` — the ONE list of
// asset-bearing columns, its coverage proven by a schema-introspection test). The seams are wired at the
// entry root: `reapIfOrphan` → `character.remove`; `backfillAvatars`/`collectGarbage`/`fsck` → the workloads
// runner-env (`assets-backfill`/`assets-gc`/`assets-fsck` kinds). Registry coverage note (D49 #4/#5): the
// introspection test enforces "every FK-to-`assets.id` column is classified retain-or-derived", so a new
// asset-bearing FK (`character_sprites.assetId`, `documents.sourceAssetId`, NPC/imagery art) cannot silently
// become GC-eligible. Design: docs/architecture/proposed/assets-maintenance.md.

import type { AssetsContext, AssetsService } from "./contract/service";
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
import { createReapIfOrphan } from "./verbs/reap-if-orphan";
import { createRebuildFromTree } from "./verbs/rebuild-from-tree";
import { createRemoveFromGallery } from "./verbs/remove-from-gallery";
import { createResolveVariant } from "./verbs/resolve-variant";
import { createStore } from "./verbs/store";

export function createAssetsService(ctx: AssetsContext): AssetsService {
  return {
    store: createStore(ctx),
    getMetadata: createGetMetadata(ctx),
    resolveVariant: createResolveVariant(ctx),
    loadAssetBytes: createLoadAssetBytes(ctx),
    assetCasRefById: createAssetCasRefById(ctx),
    listImageAssetIds: createListImageAssetIds(ctx),
    listOwned: createListOwned(ctx),
    addToGallery: createAddToGallery(ctx),
    removeFromGallery: createRemoveFromGallery(ctx),
    listGallery: createListGallery(ctx),
    backfillAvatars: createBackfillAvatars(ctx),
    collectGarbage: createCollectGarbage(ctx),
    reapIfOrphan: createReapIfOrphan(ctx),
    fsck: createFsck(ctx),
    rebuildFromTree: createRebuildFromTree(ctx),
  };
}
