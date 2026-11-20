// domain/import/substrate/gallery — the ST `user/images/` gallery plane's folder rule. SillyTavern keeps a character's
// gallery in `user/images/<folder>/`: the folder is the card's override in `extension_settings.gallery.folders` (keyed
// by the card's filename), else the card's name, written to disk through `sanitize-filename` (SillyTavern
// `public/scripts/extensions/gallery/index.js` `getGalleryFolder`, `src/endpoints/images.js`). A folder belongs to every
// card that rule names it for, and to nothing else: an image is never matched to a character by a near name.

import { stSanitizeFilename } from "#primitives/st-filename";
import type { CollectedCard } from "../contract/collection.ts";

/** Each gallery folder of a profile with the cards it belongs to. `overrides` is `extension_settings.gallery.folders`:
 *  card filename to folder name. A card whose folder sanitizes to nothing has no gallery. */
export function stGalleryFolders(cards: readonly CollectedCard[], overrides: ReadonlyMap<string, string>): ReadonlyMap<string, readonly CollectedCard[]> {
  const folders = new Map<string, CollectedCard[]>();
  for (const card of cards) {
    const folder = stSanitizeFilename(overrides.get(card.filename) ?? card.cardName);
    if (folder.length > 0) {
      folders.set(folder, [...(folders.get(folder) ?? []), card]);
    }
  }
  return folders;
}
