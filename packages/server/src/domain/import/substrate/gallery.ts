// domain/import/substrate/gallery — the ST `user/images/` gallery plane's folder rule. SillyTavern keeps a character's
// gallery in `user/images/<folder>/`: the folder is the card's override in `extension_settings.gallery.folders` (keyed
// by the card's filename), else the card's name, written to disk through `sanitize-filename` (SillyTavern
// `public/scripts/extensions/gallery/index.js` `getGalleryFolder`, `src/endpoints/images.js`). A folder belongs to every
// card that rule names it for, and to nothing else: an image is never matched to a character by a near name.

import type { CollectedCard } from "../contract/collection.ts";

// sanitize-filename's rules, in its order. Its trailing dot and space strip is a loop, not a regex, to stay linear.
const ILLEGAL = /[/?<>\\:*|"]/gu;
// The C0 and C1 control code ranges sanitize-filename strips.
const C0_END = 0x1f;
const C1_START = 0x80;
const C1_END = 0x9f;
const RESERVED = /^\.+$/u;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9\xb9\xb2\xb3]|lpt[0-9\xb9\xb2\xb3])(\..*)?$/iu;
const MAX_NAME_BYTES = 255;
const ENCODER = new TextEncoder();

function stripControls(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > C0_END && (code < C1_START || code > C1_END)) {
      out += char;
    }
  }
  return out;
}

function stripTrailingDotsAndSpaces(text: string): string {
  let end = text.length;
  while (end > 0 && (text[end - 1] === "." || text[end - 1] === " ")) {
    end -= 1;
  }
  return text.slice(0, end);
}

// truncate-utf8-bytes: the longest prefix of whole code points that fits the byte budget.
function truncateUtf8(text: string, maxBytes: number): string {
  let bytes = 0;
  let out = "";
  for (const char of text) {
    bytes += ENCODER.encode(char).length;
    if (bytes > maxBytes) {
      break;
    }
    out += char;
  }
  return out;
}

/** The directory name SillyTavern writes a gallery under for `name`: `sanitize-filename` with an empty replacement. */
export function stGalleryFolder(name: string): string {
  const stripped = stripTrailingDotsAndSpaces(stripControls(name.replace(ILLEGAL, "")).replace(RESERVED, "").replace(WINDOWS_RESERVED, ""));
  return stripTrailingDotsAndSpaces(truncateUtf8(stripped, MAX_NAME_BYTES)).replace(WINDOWS_RESERVED, "");
}

/** Each gallery folder of a profile with the cards it belongs to. `overrides` is `extension_settings.gallery.folders`:
 *  card filename to folder name. A card whose folder sanitizes to nothing has no gallery. */
export function stGalleryFolders(cards: readonly CollectedCard[], overrides: ReadonlyMap<string, string>): ReadonlyMap<string, readonly CollectedCard[]> {
  const folders = new Map<string, CollectedCard[]>();
  for (const card of cards) {
    const folder = stGalleryFolder(overrides.get(card.filename) ?? card.cardName);
    if (folder.length > 0) {
      folders.set(folder, [...(folders.get(folder) ?? []), card]);
    }
  }
  return folders;
}
