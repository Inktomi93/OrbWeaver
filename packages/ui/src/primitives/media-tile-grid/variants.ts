import { FOCUS_RING, tv } from "#lib";

// The BROWSE TILE skin. Distinct from `media-grid`'s cell, which is a square THUMBNAIL cell for an asset
// gallery (image only, selection-oriented, virtualized): a browse tile is a titled CARD whose cover is the
// primary signal and whose text is secondary but always present. Both exist because the shelf needs both — the
// missing one is what made a library of character cards render as `ListRow`s in the purged hub surface.
//
// THE COVER'S BOX IS RESERVED BY THE TILE, NOT BY THE IMAGE (the `media-grid` rule, and the `#625` lesson):
// `aspect-ratio` on a pre-load `<img>` reserves nothing, so the ASPECT lives on the cover wrapper and the image
// fills it. A grid whose rows resize on decode is the layout shift the shape-matched skeleton also exists to
// prevent.
export const mediaTileGridVariants = tv({
  slots: {
    // THE ROOT IS THE QUERY CONTAINER AND THE TRACKS ARE ITS CHILD — two elements, deliberately. A container
    // query resolves against an ANCESTOR, never the element that declares `@container`, so a single element
    // carrying both `@container` and `@md:grid-cols-3` never matches its own size: it silently stays at the
    // base column count at every width. (Measured, not theorised — the primitive's own CT caught exactly that,
    // 2 columns at 320px AND at 800px.)
    root: "@container",
    // A fluid column count by CONTAINER width, never the viewport: this grid lands inside panes the shell
    // narrows independently (an Extensions page beside a docked switcher is not a "desktop"), so a viewport
    // breakpoint would count columns for a width the grid does not have. Two columns is the floor at which a
    // cover is still a picture rather than a stamp; the track sizes are a house decision and
    // `no-arbitrary-tw-values` bars the bracket form.
    tracks: "grid grid-cols-2 gap-block @md:grid-cols-3 @2xl:grid-cols-4",
    tile: ["group flex flex-col gap-field text-left outline-none", FOCUS_RING],
    cover: "relative w-full overflow-hidden rounded-control bg-muted",
    image: "h-full w-full object-cover",
    // The no-cover fallback still occupies the reserved box, so a mixed grid stays on its rows.
    coverEmpty: "flex h-full w-full items-center justify-center text-muted-foreground",
    badge: "absolute top-field right-field",
  },
  variants: {
    aspect: {
      square: { cover: "aspect-square" },
      portrait: { cover: "aspect-portrait" },
      landscape: { cover: "aspect-video" },
    },
    interactive: {
      true: { tile: "cursor-pointer", cover: "transition-transform duration-(--motion-fast) ease-out-expo group-hover:scale-105" },
      false: {},
    },
  },
  defaultVariants: { aspect: "portrait", interactive: false },
});
