// The point-in-time (non-reactive) reduced-motion read (§13.0 litmus, DC4 rollup), for imperative call sites (a
// `useLayoutEffect` deciding a `behavior: "auto" | "smooth"` at commit time) that do not need the hook's live
// re-render. `lib/` compiles without the DOM lib, so the browser globals are reached through structural types.
import { MEDIA_QUERIES } from "#tokens";

/** The app's `system | on | off` reduced-motion attribute, which the client appearance channel writes on the root. */
export const APP_REDUCED_MOTION_ATTRIBUTE = "data-appearance-reduced-motion";

/** The root's attribute read, shared with `use-prefers-reduced-motion.ts`. */
export interface ReducedMotionRoot {
  readonly getAttribute: (name: string) => string | null;
}

interface ReducedMotionQuery {
  readonly matches: boolean;
}

/**
 * The same resolution the CSS floor makes: `on` reduces, `off` keeps motion over the OS, and `system` or a missing
 * attribute follows the OS query.
 */
export function resolveReducedMotion(root: ReducedMotionRoot | undefined, osReduced: boolean): boolean {
  const mode = root?.getAttribute(APP_REDUCED_MOTION_ATTRIBUTE) ?? null;
  if (mode === "on") {
    return true;
  }
  return mode === "off" ? false : osReduced;
}

/** `true` when reduced motion resolves on, read fresh at call time. */
export function prefersReducedMotionNow(): boolean {
  const globals = globalThis as { matchMedia?: (query: string) => ReducedMotionQuery; document?: { readonly documentElement?: ReducedMotionRoot } };
  const osReduced = typeof globals.matchMedia === "function" && globals.matchMedia(MEDIA_QUERIES["motion-reduce"]).matches;
  return resolveReducedMotion(globals.document?.documentElement, osReduced);
}

/** The scroll `behavior` to use right now for an imperative `scrollTo`/`scrollIntoView` call —
 *  `"smooth"` ignores the CSS reduced-motion floor by spec, so callers derive it here instead. */
export function scrollBehavior(): "auto" | "smooth" {
  return prefersReducedMotionNow() ? "auto" : "smooth";
}
