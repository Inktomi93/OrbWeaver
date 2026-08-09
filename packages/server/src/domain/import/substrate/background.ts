// domain/import/substrate/background — the ST `backgrounds/` plane's file rules: which entries are importable
// media, what mime each claims, and the display name the imported library entry carries. Pure: a filename in,
// data out. The BYTES are the collector's business; this file owns only the naming/mime rules.
//
// WHERE THEY LAND (owner ruling 2026-08-08 — "backgrounds is our gallery, a media store for characters and
// etc"). ST's `backgrounds/` dir is a per-user list of images the app-background picker chooses from; orb's
// exact counterpart is `appearance.backgroundLibrary` (BG-D — a per-user list of `{assetId, assetHash, mime,
// name}`, GC-rooted by the settings live-source scan and rendered by the background picker). So each file is
// CAS-stored as an owned asset of kind `background` and appended to that library. That is also what delivers
// the owner's "media store for characters and etc": an owned image is offered by `assets.listOwned`, which is
// the picker every character gallery adds from. A subject-less `gallery_items` row was deliberately NOT
// written — the only gallery surface is character-scoped (`listGallery({subjectCharacterId})`), so such a row
// would be invisible data.
//
// The mime is derived from the EXTENSION and then magic-verified inside `assets.store` (`enforceMagic`), so a
// mislabelled file is refused with a reason rather than entering the CAS as a lie.

/** The ST profile SUBDIRECTORY holding the app-background library. */
export const ST_BACKGROUND_DIR = "backgrounds";

// Extension → claimed mime. Images are the whole ST corpus; the two video containers are here because orb's
// background layer branches to `<video>` on a `video/*` library entry (BG-V) and newer ST accepts them too.
// Anything not listed is reported as an unimported background rather than guessed at.
const MIME_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
]);

/** The claimed mime for one background filename, or null when the extension is not importable media. */
export function stBackgroundMime(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  return MIME_BY_EXTENSION.get(filename.slice(dot + 1).toLowerCase()) ?? null;
}

/** The library entry's display name: the filename without its extension, as ST shows it in its own picker
 *  (`bedroom clean.jpg` → `bedroom clean`). A stem that is empty after trimming falls back to the filename. */
export function stBackgroundName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = (dot > 0 ? filename.slice(0, dot) : filename).trim();
  return stem.length > 0 ? stem : filename;
}
