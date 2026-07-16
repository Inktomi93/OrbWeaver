import { useSyncExternalStore } from "react";

// The ONE matchMedia + useSyncExternalStore reduced-motion hook for non-CSS motion paths (ECharts
// canvas timers, the smooth-text rAF pacer, Streamdown's per-block fade) that the globals.css
// unlayered reduced-motion floor can't reach.
//
// `lib/` compiles without the DOM lib, so matchMedia is accessed through a minimal structural type.
interface ReducedMotionQuery {
  readonly matches: boolean;
  readonly addEventListener: (type: "change", listener: () => void) => void;
  readonly removeEventListener: (type: "change", listener: () => void) => void;
}
const matchMediaFn = (globalThis as { matchMedia?: (query: string) => ReducedMotionQuery }).matchMedia;

// Read once at module load and cached — the query's `.matches` stays live. `null` where matchMedia
// doesn't exist (SSR / non-browser test runners); every consumer below degrades to `false`.
const reducedMotionQuery: ReducedMotionQuery | null = typeof matchMediaFn === "function" ? matchMediaFn("(prefers-reduced-motion: reduce)") : null;

function subscribeReducedMotion(onChange: () => void): () => void {
  reducedMotionQuery?.addEventListener("change", onChange);
  return (): void => reducedMotionQuery?.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  return reducedMotionQuery === null ? false : reducedMotionQuery.matches;
}

/** Live `prefers-reduced-motion: reduce` state, kept in sync via `useSyncExternalStore`. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot);
}
