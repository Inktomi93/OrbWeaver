// domain/assets — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The per-user
// content-addressed asset store's core path (4c W1): `store` (+ the `asset.created` emit), `getMetadata`
// (the owner-gated blob-serve gate), `resolveVariant` (the snap → cache → transform pipeline). The
// `AssetsContext` is assembled at the entry root (db + the injected clock/id determinism seam + the infra
// `cas`/`variants`/`imageTransform` handles + the `emit` event op) and passed in; assets injects NO guard
// (every surface is ownership-scoped off `principal.userId`, not admin/owner-gated — D21).
//
// FLAG[PD-26]: the maintenance verbs — `backfillAvatars`, `collectGarbage`, `reapIfOrphan`, `fsck`,
// `rebuildFromTree` (+ the avatar-ref registry in persistence/) — land in the assets GC/backfill wave.
// They require injection seams in OTHER domains' composition roots (`reapIfOrphan` → `character.remove`;
// the backfill slice → the workloads runner) and the avatar-ref registry over `characters.avatarAssetId` /
// `personas.avatarAssetId`; building them here would ship dead, unwired code. Target: assets.md §"Verbs".

import type { AssetsContext, AssetsService } from "./contract/service";
import { createAddToGallery } from "./verbs/add-to-gallery";
import { createGetMetadata } from "./verbs/get-metadata";
import { createListGallery } from "./verbs/list-gallery";
import { createListImageAssetIds } from "./verbs/list-image-asset-ids";
import { createListOwned } from "./verbs/list-owned";
import { createLoadAssetBytes } from "./verbs/load-asset-bytes";
import { createRemoveFromGallery } from "./verbs/remove-from-gallery";
import { createResolveVariant } from "./verbs/resolve-variant";
import { createStore } from "./verbs/store";

export function createAssetsService(ctx: AssetsContext): AssetsService {
  return {
    store: createStore(ctx),
    getMetadata: createGetMetadata(ctx),
    resolveVariant: createResolveVariant(ctx),
    loadAssetBytes: createLoadAssetBytes(ctx),
    listImageAssetIds: createListImageAssetIds(ctx),
    listOwned: createListOwned(ctx),
    addToGallery: createAddToGallery(ctx),
    removeFromGallery: createRemoveFromGallery(ctx),
    listGallery: createListGallery(ctx),
  };
}
