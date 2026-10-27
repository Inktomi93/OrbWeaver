/** Named media ratios shared by reserved frames and browse-tile covers. */
export const MEDIA_ASPECTS = ["square", "portrait", "landscape"] as const;
export type MediaAspect = (typeof MEDIA_ASPECTS)[number];

export const MEDIA_ASPECT_CLASSES: Readonly<Record<MediaAspect, string>> = {
  square: "aspect-square",
  portrait: "aspect-portrait",
  landscape: "aspect-video",
};
