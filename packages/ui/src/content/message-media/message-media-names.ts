// The message media's words. A zero-import leaf, so a spec's node side reads them without loading the primitive.

/** The tile a missing or unreadable attachment shows in its place. */
export const MEDIA_UNAVAILABLE_TEXT = "Media unavailable";

/** The click-to-load placeholder an external image or video shows until the reader asks for it, naming its host. */
export function externalMediaLoadName(host: string): string {
  return `External media: load from ${host}?`;
}
