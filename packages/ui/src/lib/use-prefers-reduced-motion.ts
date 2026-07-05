import { useSyncExternalStore } from "react";

// usePrefersReducedMotion — the ONE `matchMedia` + `useSyncExternalStore` reduced-motion hook
// (§13.0 "repeated 3+ AND changing together" litmus). Extracted from three identical forks —
// charts/chart.tsx, stream/use-smooth-text.ts, markdown/markdown.tsx — that each re-derived this
// exact matchMedia plumbing for a non-CSS motion path (ECharts canvas timers, the smooth-text rAF
// pacer, Streamdown's per-block fade) that the globals.css unlayered reduced-motion floor can't
// reach. Any future non-CSS motion consumer imports from here instead of forking a 4th copy.
//
// `lib/` compiles WITHOUT the DOM lib (it's the pure-utils home of `cn`/`isSafeColor`), so the DOM
// `MediaQueryList`/`matchMedia` names aren't in scope here. This is a browser-only hook, so it accesses
// `matchMedia` through a minimal STRUCTURAL type (DOM-name-free) — type-safe without pulling the DOM lib
// into the isomorphic utils dir.
interface ReducedMotionQuery {
  readonly matches: boolean;
  readonly addEventListener: (type: "change", listener: () => void) => void;
  readonly removeEventListener: (type: "change", listener: () => void) => void;
}
const matchMediaFn = (globalThis as { matchMedia?: (query: string) => ReducedMotionQuery })
  .matchMedia;

// Read ONCE at module load and cached — the query's `.matches` stays live (the browser updates it in
// place), so re-querying per render/subscribe would be waste. Guarded for environments without
// `matchMedia` (non-browser test runners, SSR): `null` there, and every consumer below degrades to a
// stable `false` snapshot instead of throwing.
const reducedMotionQuery: ReducedMotionQuery | null =
  typeof matchMediaFn === "function" ? matchMediaFn("(prefers-reduced-motion: reduce)") : null;

function subscribeReducedMotion(onChange: () => void): () => void {
  reducedMotionQuery?.addEventListener("change", onChange);
  return (): void => reducedMotionQuery?.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  return reducedMotionQuery === null ? false : reducedMotionQuery.matches;
}

/**
 * Live `prefers-reduced-motion: reduce` state, kept in sync via `useSyncExternalStore` over
 * `matchMedia`'s `change` event (no polling, no missed flips mid-session). `false` where
 * `matchMedia` doesn't exist (SSR / non-browser test runners) rather than throwing.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot);
}
