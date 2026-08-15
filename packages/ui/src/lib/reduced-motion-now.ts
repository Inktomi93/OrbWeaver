// The point-in-time (non-reactive) reduced-motion read (§13.0 litmus, DC4 rollup) — for imperative
// call sites (a `useLayoutEffect` deciding a `behavior: "auto" | "smooth"` at commit time) that
// don't need `usePrefersReducedMotion()`'s live re-render on a mid-session flip. Shares the same
// DOM-name-free STRUCTURAL type as the hook (`lib/` compiles without the DOM lib — see
// `use-prefers-reduced-motion.ts`'s header) so neither pulls the DOM lib into the isomorphic utils dir.
interface ReducedMotionQuery {
  readonly matches: boolean;
}
interface ReducedMotionDocument {
  readonly querySelector: (selector: string) => unknown;
}

/** `true` when the OS or the app-level preference requests reduced motion, read fresh at call time. */
export function prefersReducedMotionNow(): boolean {
  const globals = globalThis as { matchMedia?: (query: string) => ReducedMotionQuery; document?: ReducedMotionDocument };
  const osReduced = typeof globals.matchMedia === "function" && globals.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const appPreference = globals.document?.querySelector('[data-reduced-motion="true"]');
  return osReduced || (appPreference !== null && appPreference !== undefined);
}

/** The scroll `behavior` to use right now for an imperative `scrollTo`/`scrollIntoView` call —
 *  `"smooth"` ignores the CSS reduced-motion floor by spec, so callers derive it here instead. */
export function scrollBehavior(): "auto" | "smooth" {
  return prefersReducedMotionNow() ? "auto" : "smooth";
}
