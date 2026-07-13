// scroll-behavior — the reduced-motion-aware imperative scroll behavior. Explicit `behavior: "smooth"`
// on scrollTo/scrollIntoView ignores the CSS reduced-motion floor by spec, so this helper is the one home
// for every imperative scroll call site in this feature.

import { prefersReducedMotionNow } from "@orb/ui/lib";

/** The scroll `behavior` to use right now. Point-in-time, not reactive — call it fresh at each site. */
export function scrollBehavior(): "auto" | "smooth" {
  return prefersReducedMotionNow() ? "auto" : "smooth";
}
