// The lightbox's words: its close control's name and the viewer's own name. A zero-import leaf, so a spec's node side reads them without loading the primitive.

/** What the viewer holds. */
export type LightboxMedia = "image" | "video";

export const LIGHTBOX_LABELS = {
  close: "Close viewer",
  /** The viewer's name when its media has no alt text to name it by. */
  viewer: { image: "Image viewer", video: "Video viewer" },
} as const satisfies { readonly close: string; readonly viewer: Readonly<Record<LightboxMedia, string>> };

/** The accessible name of the viewer dialog: the alt text of what it shows, or the viewer's own name when the media has none. */
export function lightboxName(media: LightboxMedia, alt: string): string {
  const shown = alt.trim();
  return shown === "" ? LIGHTBOX_LABELS.viewer[media] : shown;
}
