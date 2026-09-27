// The gallery grids' thumbnail URL. An animated source never takes it: the grid renders the original for an
// animated item, because a `?w=` variant would freeze-frame it.

import { blobUrl } from "@orb/contracts/assets";

const GALLERY_THUMB_WIDTH = 240;

/** The `?w=` thumbnail of a gallery-grid image. */
export function galleryThumbUrl(hash: string): string {
  return `${blobUrl(hash)}?w=${GALLERY_THUMB_WIDTH}`;
}
