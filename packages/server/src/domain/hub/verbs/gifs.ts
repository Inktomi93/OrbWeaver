// verbs: searchGifs + importGif — the gif slice (D61 gallery-design §5, migrated to hub per doc 02 §5).
//
// searchGifs: resolve the CALLER's gif-search key (missing ⇒ the no-credential floor, a client banner) →
//   the Tenor search adapter op → normalized hits. Owner-scoped: only the acting principal's own key.
//
// importGif — the SSRF + untrusted-image + IDOR chokepoint, in this exact order:
//   1. EARLY ownership gate — if a `subjectCharacterId` is given, reject a foreign/missing one with
//      NOT_FOUND BEFORE any network work (leak-free IDOR + DoS: a stranger can't make the server fetch by
//      passing someone else's character id).
//   2. fetch the bytes via the injected host-gated + magic-validated op (Tenor media-host allowlist +
//      `isAllowedImageBuffer` live INSIDE the op — the domain never fetches raw). A bad host / non-image /
//      oversized / dimension-bomb buffer throws → mapped to the single leak-free `hub_rejected_content`.
//   3. store the validated bytes as a `"gallery"` asset (owner = caller) → 4. curate into the gallery.
// One verb does fetch+store+curate because the gesture is "add this gif to my gallery" — a torn
// imported-but-not-curated state is the failure mode a split would create (gallery-design §5).

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
      // The floor: no key ⇒ the client surfaces a "configure gif search" banner (the LLM resolver's
      // no-credential UX). NEVER a host/owner fallback (a shared key would meter the owner's Tenor quota).
      throw new DomainNoCredentialError(GIF_SEARCH_PROVIDER);
    }
    try {
      return await ctx.searchGifs({ apiKey, query, limit, cursor });
    } catch (err) {
      // The upstream body/detail (and the key-bearing URL) NEVER reach the client — only the code.
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
    // 1. EARLY leak-free ownership gate (before any fetch).
    if (subjectCharacterId !== undefined) {
      const owned = await ctx.assertCharacterOwned(principal.userId, subjectCharacterId);
      if (!owned) {
        throw new DomainNotFoundError("character", subjectCharacterId);
      }
    }
    // 2. Fetch + validate (host allowlist + image guard inside the op). Failures collapse to one code.
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
    // 3. Store as a gallery asset (owner = caller) → 4. curate.
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
