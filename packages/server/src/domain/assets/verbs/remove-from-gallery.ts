// verb: removeFromGallery — gallery v2 (§1.3). Remove a gallery item the caller owns. There is no stamped
// owner column: the owner is resolved THROUGH the asset join (`gallery_items → assets.ownerId`), compared
// to the actor, and a non-owner/missing item rejects with `GalleryItemNotFoundError` (leak-free — "missing"
// and "not yours" collapse). The asset itself is untouched (removing a curation row never deletes bytes).

import { GalleryItemNotFoundError } from "../contract/errors";
import type { RemoveFromGalleryParams } from "../contract/params";
import type { AssetsContext, AssetsService } from "../contract/service";
import { deleteGalleryItemRow, galleryItemOwner } from "../persistence/queries";

export function createRemoveFromGallery(ctx: AssetsContext): AssetsService["removeFromGallery"] {
  return async ({ principal, galleryItemId }: RemoveFromGalleryParams): Promise<void> => {
    const ownerId = await galleryItemOwner(ctx.db, galleryItemId);
    if (ownerId === undefined || ownerId !== principal.userId) {
      throw new GalleryItemNotFoundError(galleryItemId);
    }
    await deleteGalleryItemRow(ctx.db, galleryItemId);
  };
}
