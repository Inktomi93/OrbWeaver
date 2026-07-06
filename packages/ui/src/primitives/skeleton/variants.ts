import { tv } from "#lib";

// The skeleton skin — a muted placeholder the caller sizes via className, with the shimmer sweep
// (D62 UIP-309). The `orb-skeleton-shimmer` class (globals.css) paints the moving muted→accent→muted
// gradient over the `bg-muted` base; under `prefers-reduced-motion` it drops to the flat `bg-muted`
// fill (the class self-neutralizes) — reduced-motion-safe by construction, no JS motion hook needed.
export const skeletonVariants = tv({
  base: "orb-skeleton-shimmer block bg-muted",
  variants: {
    variant: {
      rect: "rounded-control",
      text: "w-2/3 rounded-control",
      circle: "aspect-square rounded-full",
    },
  },
  defaultVariants: { variant: "rect" },
});
