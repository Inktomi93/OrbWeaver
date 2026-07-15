// Cross-cutting @orb/ui seams with no better single home: the class-merge (cn), the configured
// variant factory (tv), and the reduced-motion live-query hook. Primitives import these from here,
// never a raw lib directly.
import { createTV } from "tailwind-variants";

export { isSafeColor } from "@orb/kit/safe-color";
export { cn } from "tailwind-variants";
export { ANCHOR_GAP_INPUT, ANCHOR_GAP_TRIGGER } from "./anchor-gap";
export {
  FOCUS_RING,
  FOCUS_RING_DESTRUCTIVE,
  FOCUS_RING_HAS,
  FOCUS_RING_INSET,
  FOCUS_RING_WITHIN,
} from "./focus-ring";
export { OVERLAY_MOTION } from "./overlay-motion";
export {
  type PortalContainer,
  PortalContainerContext,
  usePortalContainer,
} from "./portal-container";
export { prefersReducedMotionNow, scrollBehavior } from "./reduced-motion-now";
export { formatResultCount } from "./result-count";
export { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

// tv is a createTV-CONFIGURED factory, never the raw tailwind-variants export — the DTCG type-scale
// utilities are custom --text-* tokens tailwind-merge otherwise misclassifies as text COLORS,
// silently dropping the size class. Must be baked into the factory (a per-call twMergeConfig loses a cache race).
export const tv = createTV({
  twMergeConfig: {
    extend: {
      classGroups: {
        "font-size": [{ text: ["display", "headline", "title", "body", "label", "code", "micro"] }],
      },
    },
  },
});
