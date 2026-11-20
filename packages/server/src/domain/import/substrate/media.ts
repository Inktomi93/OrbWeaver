// The ST media file rules the backgrounds and gallery planes share: which files are importable media, the mime each
// claims, and the display name an imported file carries. Pure: a filename in, data out.
//
// The mime is derived from the EXTENSION, and the loader stores a picture under its sniffed type instead. `assets.store`
// magic-verifies every claim (`enforceMagic`), so a mislabelled non-picture is refused with a reason.

// Extension → claimed mime. Images are the whole ST corpus; the two video containers are here because orb's
// background layer branches to `<video>` on a `video/*` library entry (BG-V) and newer ST accepts them too.
// Anything not listed is reported as an unimported file rather than guessed at.
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

/** The claimed mime for one media filename, or null when the extension is not importable media. */
export function stMediaMime(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  return MIME_BY_EXTENSION.get(filename.slice(dot + 1).toLowerCase()) ?? null;
}

/** An imported file's display name: the filename without its extension, as ST shows it in its own picker
 *  (`bedroom clean.jpg` → `bedroom clean`). A stem that is empty after trimming falls back to the filename. */
export function stMediaName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = (dot > 0 ? filename.slice(0, dot) : filename).trim();
  return stem.length > 0 ? stem : filename;
}
