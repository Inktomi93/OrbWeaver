// The per-character gallery reads and curation mutations behind the gallery dialog. The grid and the add-picker
// are keyset-paged `createCollectionSurface`s over `assets.listGallery` and `assets.listOwned`; every scope and
// sort is a query INPUT, so a change resets the pages rather than filtering a stale set. Gallery curation is not
// on the chat bus (assets are per-user state), so each mutation's `invalidates` refetches both reads.

import type { GalleryCursor, GallerySort, OwnedAssetCursor } from "@orb/contracts/assets";
import { ASSET_LIST_LIMIT_MAX } from "@orb/contracts/assets";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createCollectionSurface, createEntityMutation } from "#data";

// Rows per keyset page: the wire's own ceiling, for both reads. The grids virtualize, so a full page costs the DOM nothing.
const GALLERY_PAGE_LIMIT = ASSET_LIST_LIMIT_MAX;

type GalleryPage = inferOutput<Trpc["assets"]["listGallery"]>;
type GalleryItem = GalleryPage[number];
type OwnedPage = inferOutput<Trpc["assets"]["listOwned"]>;
type OwnedAsset = OwnedPage[number];

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

/** The cursor that continues after an owned-asset page, or `undefined` at the end (a short page is the last). */
function nextOwnedCursor(page: OwnedPage): OwnedAssetCursor | undefined {
  const last = page.at(-1);
  return page.length < GALLERY_PAGE_LIMIT || last === undefined ? undefined : { uploadedAt: last.uploadedAt, assetId: last.assetId };
}

/** The add-picker's candidates: the caller's own images not already in `characterId`'s gallery, filtered on the
 *  server before the limit, so an empty first page means there is nothing left to add. */
export const useGalleryCandidates = createCollectionSurface({
  query: (trpc: Trpc, params: { readonly characterId: CharacterId }) =>
    trpc.assets.listOwned.infiniteQueryOptions({ limit: GALLERY_PAGE_LIMIT, galleryCandidatesFor: params.characterId }, { getNextPageParam: nextOwnedCursor }),
  itemsOf: (page: OwnedPage) => page,
  idOf: (item: OwnedAsset) => item.assetId,
});

/** Curate an owned asset into a character's gallery (idempotent server-side). Refetches the gallery and the
 *  add-picker's candidates, which it just shrank. Its callers, the add-picker and the upload zone, also name a
 *  failed add on their own inline line. */
export const useAddToGallery = createEntityMutation<inferInput<Trpc["assets"]["addToGallery"]>, inferOutput<Trpc["assets"]["addToGallery"]>>({
  options: (trpc) => trpc.assets.addToGallery.mutationOptions(),
  invalidates: (trpc) => [trpc.assets.listGallery.pathFilter(), trpc.assets.listOwned.pathFilter()],
  errorToast: "Couldn't add the image to the gallery.",
});

/**
 * Remove a curated item from the gallery (the underlying asset is untouched). Refetches the gallery and the
 * add-picker's candidates, which the image rejoins. Its caller, the gallery lightbox's destructive confirm, also
 * keeps the dialog open on its inline failure line with its own button as the retry.
 */
export const useRemoveFromGallery = createEntityMutation<inferInput<Trpc["assets"]["removeFromGallery"]>, unknown>({
  options: (trpc) => trpc.assets.removeFromGallery.mutationOptions(),
  invalidates: (trpc) => [trpc.assets.listGallery.pathFilter(), trpc.assets.listOwned.pathFilter()],
  errorToast: "Couldn't remove the image from the gallery.",
});
