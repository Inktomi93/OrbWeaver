// domain/assets/contract/errors — the CAS core path stays typed-error-free (coherence faults are plain
// `Error`; the blob-serve gate collapses "not found / not yours" into `undefined` → 404). The GALLERY
// mutations (`addToGallery`/`removeFromGallery`) are the first assets surfaces that must REJECT a request
// (not answer `undefined`), so they earn typed not-found errors — leak-free: "missing" and "not yours"
// collapse into one NOT_FOUND (D21), exactly like the character domain's `CharacterNotFoundError`. Both
// extend the kit `DomainNotFoundError` so the transport maps them to NOT_FOUND uniformly while tests can
// discriminate (`rejects.toBeInstanceOf(...)`).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, GalleryItemId } from "@orb/kit/ids";

/** The asset an `addToGallery` referenced is missing OR isn't the caller's (the two collapse — no
 *  foreign-existence leak). */
export class AssetNotFoundError extends DomainNotFoundError {
  public readonly assetId: AssetId;
  constructor(assetId: AssetId) {
    super("asset", assetId);
    this.assetId = assetId;
    this.name = this.constructor.name;
  }
}

/** The gallery item a `removeFromGallery` referenced is missing OR isn't the caller's (owner resolved
 *  THROUGH the asset join; a non-owner is indistinguishable from missing). */
export class GalleryItemNotFoundError extends DomainNotFoundError {
  public readonly galleryItemId: GalleryItemId;
  constructor(galleryItemId: GalleryItemId) {
    super("gallery_item", galleryItemId);
    this.galleryItemId = galleryItemId;
    this.name = this.constructor.name;
  }
}
