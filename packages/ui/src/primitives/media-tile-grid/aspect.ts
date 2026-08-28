// The browse tile's COVER-RATIO axis, in its own module — the `avatar/hue.ts` shape: a components module may
// not also export a non-component (`useComponentExportOnlyModules`), and the ratio tuple is exactly the kind of
// vocabulary a consumer imports without importing a renderer.

/** The reserved cover ratios — token-named, never a bracket (`aspect-portrait` is a real DTCG token;
 *  `aspect-square`/`aspect-video` are core Tailwind). ONE `as const` tuple with the type DERIVED from it, so a
 *  new ratio is one edit `tsc` then chases to every renderer that maps the axis. */
export const MEDIA_TILE_ASPECTS = ["square", "portrait", "landscape"] as const;
export type MediaTileAspect = (typeof MEDIA_TILE_ASPECTS)[number];
