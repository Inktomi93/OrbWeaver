// verb: removeFromGallery — gallery v2 (§1.3). Remove a gallery item the caller owns. There is no stamped
// owner column: ownership resolves THROUGH the asset join (`gallery_items → assets.ownerId`) in the read
// itself, and a non-owner/missing item rejects with `GalleryItemNotFoundError` (leak-free — "missing"
// and "not yours" collapse). The asset itself is untouched (removing a curation row never deletes bytes).

import type { AssetsContext } from "../context.ts";
import { GalleryItemNotFoundError } from "../contract/errors.ts";
import type { RemoveFromGalleryParams } from "../contract/params.ts";
import type { AssetsService } from "../contract/service.ts";
import { deleteGalleryItemRow, ownsGalleryItem } from "../persistence/queries.ts";

export function createRemoveFromGallery(ctx: AssetsContext): AssetsService["removeFromGallery"] {
  return async ({ principal, galleryItemId }: RemoveFromGalleryParams): Promise<void> => {
    if (!(await ownsGalleryItem(ctx.db, principal.userId, galleryItemId))) {
      throw new GalleryItemNotFoundError(galleryItemId);
    }
    await deleteGalleryItemRow(ctx.db, galleryItemId);
  };
}
