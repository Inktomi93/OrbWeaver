// verb: listGallery — the caller's curated items in one date order, keyset-paged by `(createdAt, galleryItemId)`.
// Owner-scoped through the asset join (`assets.ownerId`); the subject and room filters only narrow that scope, so
// naming a shared room returns the caller's own pictures from it. No envelope: a short page is the end.

import { DEFAULT_GALLERY_SORT } from "@orb/contracts/assets";
import type { AssetsContext } from "../context.ts";
import type { GalleryListParams } from "../contract/params.ts";
import type { AssetsService } from "../contract/service.ts";
import type { GalleryItemView } from "../contract/views.ts";
import { listGalleryViewRows } from "../persistence/queries.ts";

export function createListGallery(ctx: AssetsContext): AssetsService["listGallery"] {
  return ({ principal, subjectCharacterId, chatId, limit, sort, cursor }: GalleryListParams): Promise<GalleryItemView[]> =>
    listGalleryViewRows(ctx.db, {
      ownerId: principal.userId,
      subjectCharacterId,
      chatId,
      limit,
      sort: sort ?? DEFAULT_GALLERY_SORT,
      cursor,
    });
}
