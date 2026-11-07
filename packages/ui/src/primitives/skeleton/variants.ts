import { CAP, GROW, HEIGHT, tv, WIDTH } from "#lib";

// The skeleton skin — a muted placeholder sized by the box it stands in for, with the shimmer sweep
// (D62 UIP-309). The `orb-skeleton-shimmer` class (globals.css) paints the moving muted→accent→muted
// gradient over the `bg-muted` base; under `prefers-reduced-motion` it drops to the flat `bg-muted`
// fill (the class self-neutralizes) — reduced-motion-safe by construction, no JS motion hook needed.
//
// THE SWEEP COVERS THE BASE WHENEVER MOTION IS ON (its pseudo-element is 200% wide), so `bg-muted` here is
// the REDUCED-MOTION fill and the gradient's two stops are what everyone else sees. A host whose surface
// the muted/accent pair cannot separate from re-points both through the `--orb-skeleton-sweep-*` custom
// properties AND overrides this base (#690 — the transcript's over-art reading plate is the one such host;
// `WALLPAPER_PLATE.loading` in lib/ground.ts re-points it). Unset here on purpose: the stops default through a
// var() FALLBACK in globals.css, because a declaration on this element would outrank a host's inherited one.
//
// A skeleton stands in for a real box, so it is sized by that box's own table: `height` is a control step, a line box of a voice, a picture or
// the placeholder row; `width` is the same box's width, or the share of its line a stand-in sentence takes, which holds at any pane width.
const STAND_IN_HEIGHT = {
  ...HEIGHT,
  chip: "block-(--size-touch-target)",
  row: "block-(--height-row-placeholder)",
  lineLabel: "block-(--leading-label)",
  lineMicro: "block-(--leading-micro)",
  avatarMd: "block-(--size-avatar-md)",
  avatarLg: "block-(--size-avatar-lg)",
  avatarHero: "block-(--size-avatar-hero)",
} as const;
const STAND_IN_WIDTH = {
  ...WIDTH,
  sixth: "inline-1/6",
  quarter: "inline-1/4",
  third: "inline-1/3",
  half: "inline-1/2",
  threeQuarters: "inline-3/4",
} as const;

export const skeletonVariants = tv({
  base: "orb-skeleton-shimmer relative block overflow-hidden bg-muted",
  variants: {
    variant: {
      rect: "rounded-control",
      text: "rounded-control inline-2/3",
      circle: "aspect-square rounded-full",
      // The box an Avatar or a portrait draws: the base radius, so the placeholder matches what replaces it.
      portrait: "rounded-base",
    },
    height: STAND_IN_HEIGHT,
    width: STAND_IN_WIDTH,
    cap: CAP,
    grow: GROW,
    // Lies over the whole of a positioned host: the picture or the band that is still loading behind it.
    cover: { true: "absolute inset-0", false: "" },
  },
  defaultVariants: { variant: "rect" },
});
