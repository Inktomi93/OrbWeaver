// The per-character gallery read and curation mutations behind the gallery dialog. The grid is a keyset-paged
// `createCollectionSurface` over `assets.listGallery`; every scope and sort is a query INPUT, so a change resets
// the pages rather than filtering a stale set. Gallery curation is not on the chat bus (assets are per-user
// state), so each mutation's `invalidates` refetches the gallery itself. tRPC shapes are inferred, never re-declared.

import type { GalleryCursor, GallerySort } from "@orb/contracts/assets";
import { ASSET_LIST_LIMIT_MAX } from "@orb/contracts/assets";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createCollectionSurface, createEntityMutation } from "#data";

/** Rows per keyset page — the wire's own ceiling, for both gallery reads (`listGallery` and the add-picker's
 *  `listOwned`). The grid virtualizes, so a full page costs the DOM nothing. */
export const GALLERY_PAGE_LIMIT = ASSET_LIST_LIMIT_MAX;

type GalleryPage = inferOutput<Trpc["assets"]["listGallery"]>;
type GalleryItem = GalleryPage[number];

/** The cursor that continues after `page`, or `undefined` at the end. The read serves no envelope: a short
 *  page is the last one. */
function nextGalleryCursor(page: GalleryPage): GalleryCursor | undefined {
  const last = page.at(-1);
  return page.length < GALLERY_PAGE_LIMIT || last === undefined ? undefined : { createdAt: last.createdAt, galleryItemId: last.galleryItemId };
}

/** One character's gallery, paged. `chatId: null` is the whole gallery; a chat narrows it to the pictures
 *  generated in that room (server-side, inside the caller's own gallery). */
export const useGalleryCollection = createCollectionSurface({
  query: (trpc: Trpc, params: { readonly characterId: CharacterId; readonly chatId: ChatId | null; readonly sort: GallerySort }) =>
    trpc.assets.listGallery.infiniteQueryOptions(
      {
        subjectCharacterId: params.characterId,
        ...(params.chatId === null ? {} : { chatId: params.chatId }),
        limit: GALLERY_PAGE_LIMIT,
        sort: params.sort,
      },
      { getNextPageParam: nextGalleryCursor },
    ),
  itemsOf: (page: GalleryPage) => page,
  idOf: (item: GalleryItem) => item.galleryItemId,
});

/** Curate an owned asset into a character's gallery (idempotent server-side). Refetches the gallery.
 *  NO `errorToast`: both callers, the add-picker and the upload zone, name a failed add on their own inline
 *  line, and a toast on top would report one failure twice. A new caller without such a line owes one. */
export const useAddToGallery = createEntityMutation<inferInput<Trpc["assets"]["addToGallery"]>, inferOutput<Trpc["assets"]["addToGallery"]>>({
  options: (trpc) => trpc.assets.addToGallery.mutationOptions(),
  invalidates: (trpc) => [trpc.assets.listGallery.pathFilter()],
});

/**
 * Remove a curated item from the gallery (the underlying asset is untouched). Refetches the gallery.
 *
 * NO `errorToast`, deliberately (#1563a). Its ONE caller is the gallery lightbox's destructive confirm, and
 * #1563 gave `ConfirmDialog` an inline failure line that holds the dialog open with its own button as the
 * retry — so a toast on top made one refused press say the same thing twice, once in the dialog the reader
 * is looking at and once in a global notice over it.
 *
 * ENDS WHEN a second call site appears that does not own a failure surface — then this owes the function
 * form, not a bare string, so the confirm's press stays silent while the new caller toasts.
 */
export const useRemoveFromGallery = createEntityMutation<inferInput<Trpc["assets"]["removeFromGallery"]>, unknown>({
  options: (trpc) => trpc.assets.removeFromGallery.mutationOptions(),
  invalidates: (trpc) => [trpc.assets.listGallery.pathFilter()],
});
