// verb: addToGallery — gallery v2 (§1.3). Curate an owned asset into the gallery, optionally as a
// character's subject. Owner-only posture (§1.3 `can()`): the asset MUST be owned by the actor (the
// assetId-keyed owner gate `ownedAssetForGallery`); the subject character, when given AND when the
// `assertCharacterOwned` op is wired, must also be owned — a gallery row must never reference another
// user's asset or character. Upsert-guarded on the subject: a duplicate add returns the existing item
// (idempotent) — for the un-charactered add too, which needs its own partial unique index because SQLite
// treats NULL subjects as distinct (#1375; `persistence/queries.ts#insertGalleryItem` owns the mechanics).
// Deterministic via the injected `newGalleryItemId`/`now`.
//
// Degradation (documented): when `assertCharacterOwned` is absent (non-HTTP/DR/workload contexts that never
// call this verb), the subject-character ownership check is skipped and the add gates on the asset only.
// The entry root wires the op (a direct owner-scoped `characters` read), so the HTTP path always enforces it.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetsContext } from "../context.ts";
import { AssetNotFoundError } from "../contract/errors.ts";
import type { GalleryAddParams } from "../contract/params.ts";
import type { AssetsService } from "../contract/service.ts";
import type { GalleryItemView } from "../contract/views.ts";
import { galleryItemViewById, insertGalleryItem, ownedAssetForGallery } from "../persistence/queries.ts";

export function createAddToGallery(ctx: AssetsContext): AssetsService["addToGallery"] {
  return async ({ principal, assetId, subjectCharacterId }: GalleryAddParams): Promise<GalleryItemView> => {
    // Leak-free: missing / not-yours collapse into NOT_FOUND.
    const owned = await ownedAssetForGallery(ctx.db, principal.userId, assetId);
    if (owned === undefined) {
      throw new AssetNotFoundError(assetId);
    }
    if (subjectCharacterId !== undefined && ctx.assertCharacterOwned !== undefined) {
      const characterOwned = await ctx.assertCharacterOwned(principal.userId, subjectCharacterId);
      if (!characterOwned) {
        throw new DomainNotFoundError("character", subjectCharacterId);
      }
    }
    const galleryItemId = await insertGalleryItem(ctx.db, {
      id: ctx.newGalleryItemId(),
      assetId,
      subjectCharacterId,
      now: ctx.now(),
    });
    const view = await galleryItemViewById(ctx.db, galleryItemId);
    if (view === undefined) {
      throw new Error(`assets.addToGallery: row missing after insert (${galleryItemId})`);
    }
    return view;
  };
}
