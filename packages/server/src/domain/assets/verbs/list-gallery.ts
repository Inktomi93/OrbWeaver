// verb: listGallery — gallery v2 (§1.3). "List my gallery": the caller's curated items, newest-first,
// keyset-paged by `(createdAt, galleryItemId)`. Owner-scoped via the asset join filtered on
// `assets.ownerId = actor` (no stamped owner column to scope on — §1.3); optional `subjectCharacterId`
// filter (omitted = the whole gallery). Returns a plain `GalleryItemView[]` — same no-envelope keyset
// contract as `listOwned`. Each row carries the stored `animated` fact (G2, joined from `assets`).

import type { AssetsContext } from "../context";
import type { GalleryListParams } from "../contract/params";
import type { AssetsService } from "../contract/service";
import type { GalleryItemView } from "../contract/views";
import { listGalleryViewRows } from "../persistence/queries";

export function createListGallery(ctx: AssetsContext): AssetsService["listGallery"] {
  return ({
    principal,
    subjectCharacterId,
    limit,
    cursor,
    cursorId,
  }: GalleryListParams): Promise<GalleryItemView[]> =>
    listGalleryViewRows(ctx.db, {
      ownerId: principal.userId,
      subjectCharacterId,
      limit,
      cursor,
      cursorId,
    });
}
