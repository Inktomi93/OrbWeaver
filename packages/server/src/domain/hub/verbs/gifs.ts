// verbs: searchGifs + importGif — the gif slice.
// importGif order matters: ownership-check BEFORE fetch (leak-free IDOR/DoS), fetch is host-allowlisted +
// image-validated inside the op, then store+curate as one verb (no torn imported-but-not-curated state).

import {
  DomainNoCredentialError,
  DomainNotFoundError,
  DomainOperationError,
} from "@orb/kit/errors";
import { HUB_OP_CODES } from "../contract/errors";
import type { ImportGifParams, SearchGifsParams } from "../contract/params";
import type { GalleryItemView, GifSearchResult } from "../contract/results";
import type { HubContext, HubService } from "../contract/service";

const GIF_SEARCH_PROVIDER = "gif-search";

/** The gif verbs (search + import) built over one shared context. One factory per file (verb-naming); the
 *  composition root spreads the returned pair into the `HubService`. */
export function createGifs(ctx: HubContext): Pick<HubService, "searchGifs" | "importGif"> {
  return { searchGifs: createSearchGifs(ctx), importGif: createImportGif(ctx) };
}

function createSearchGifs(ctx: HubContext): HubService["searchGifs"] {
  return async ({
    principal,
    query,
    limit,
    cursor,
  }: SearchGifsParams): Promise<GifSearchResult> => {
    const apiKey = await ctx.resolveGifKey(principal);
    if (apiKey === null) {
      // No owner/shared-key fallback — that would meter the owner's Tenor quota.
      throw new DomainNoCredentialError(GIF_SEARCH_PROVIDER);
    }
    try {
      return await ctx.searchGifs({ apiKey, query, limit, cursor });
    } catch (err) {
      // Upstream body/detail (and the key-bearing URL) never reach the client — only the code.
      const unavailable = new DomainOperationError(
        HUB_OP_CODES.unavailable,
        "Gif search is temporarily unavailable.",
      );
      unavailable.cause = err;
      throw unavailable;
    }
  };
}

function createImportGif(ctx: HubContext): HubService["importGif"] {
  return async ({
    principal,
    url,
    subjectCharacterId,
  }: ImportGifParams): Promise<GalleryItemView> => {
    if (subjectCharacterId !== undefined) {
      const owned = await ctx.assertCharacterOwned(principal.userId, subjectCharacterId);
      if (!owned) {
        throw new DomainNotFoundError("character", subjectCharacterId);
      }
    }
    let fetched: { readonly bytes: Uint8Array; readonly mime: string };
    try {
      fetched = await ctx.fetchGifImage(url);
    } catch (err) {
      const rejected = new DomainOperationError(
        HUB_OP_CODES.rejectedContent,
        "That gif could not be imported.",
      );
      rejected.cause = err;
      throw rejected;
    }
    const stored = await ctx.storeGalleryAsset({
      principal,
      bytes: fetched.bytes,
      mime: fetched.mime,
    });
    return ctx.addToGallery({
      principal,
      assetId: stored.assetId,
      ...(subjectCharacterId !== undefined ? { subjectCharacterId } : {}),
    });
  };
}
