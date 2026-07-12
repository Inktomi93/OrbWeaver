// scroll-behavior — the reduced-motion-aware imperative scroll behavior (DC3). Explicit
// `behavior: "smooth"` on `scrollTo`/`scrollIntoView` ignores the CSS `scroll-behavior: auto !important`
// reduced-motion floor by spec (it's a JS-driven animation, not a CSS one) — a WCAG baseline miss the
// settings shell's OWN `flashAnchor` already guarded correctly. One helper, all three call sites
// (settings-shell-surface.tsx ×2 + connections-settings-surface.tsx) + the shell's hand-rolled
// `matchMedia` in `flashAnchor` collapse onto it. Self-contained in this feature's `lib/` for now (the
// spec allows promoting it to the shared client `#lib` later — `prefersReducedMotionNow` itself already
// lives in `@orb/ui`'s `#lib`, the sanctioned one-home for the underlying query).

import { prefersReducedMotionNow } from "@orb/ui/lib";

/** The scroll `behavior` to use right now — `"auto"` under `prefers-reduced-motion: reduce`, else
 *  `"smooth"`. Point-in-time (not reactive): call it fresh at each imperative scroll call site. */
export function scrollBehavior(): "auto" | "smooth" {
  return prefersReducedMotionNow() ? "auto" : "smooth";
}
