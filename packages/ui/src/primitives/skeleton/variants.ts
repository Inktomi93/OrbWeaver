import { tv } from "#lib";

// The skeleton skin — a muted placeholder the caller sizes via className, with the shimmer sweep
// (D62 UIP-309). The `orb-skeleton-shimmer` class (globals.css) paints the moving muted→accent→muted
// gradient over the `bg-muted` base; under `prefers-reduced-motion` it drops to the flat `bg-muted`
// fill (the class self-neutralizes) — reduced-motion-safe by construction, no JS motion hook needed.
//
// THE SWEEP COVERS THE BASE WHENEVER MOTION IS ON (its pseudo-element is 200% wide), so `bg-muted` here is
// the REDUCED-MOTION fill and the gradient's two stops are what everyone else sees. A host whose surface
// the muted/accent pair cannot separate from re-points both through the `--orb-skeleton-sweep-*` custom
// properties AND overrides this base (#690 — the transcript's over-art reading plate is the one such host;
// `message-row-backing.ts` states the measurement). Unset here on purpose: the stops default through a
// var() FALLBACK in globals.css, because a declaration on this element would outrank a host's inherited one.
export const skeletonVariants = tv({
  base: "orb-skeleton-shimmer relative block overflow-hidden bg-muted",
  variants: {
    variant: {
      rect: "rounded-control",
      text: "w-2/3 rounded-control",
      circle: "aspect-square rounded-full",
    },
  },
  defaultVariants: { variant: "rect" },
});
