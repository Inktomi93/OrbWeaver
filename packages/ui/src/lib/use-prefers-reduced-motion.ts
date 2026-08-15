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
interface ReducedMotionDocument {
  readonly documentElement?: unknown;
  readonly querySelector: (selector: string) => unknown;
}
interface ReducedMotionObserver {
  readonly observe: (target: unknown, options: { readonly attributes: true; readonly subtree: true; readonly attributeFilter: readonly string[] }) => void;
  readonly disconnect: () => void;
}
interface ReducedMotionObserverConstructor {
  new (listener: () => void): ReducedMotionObserver;
}
const matchMediaFn = (globalThis as { matchMedia?: (query: string) => ReducedMotionQuery }).matchMedia;
const reducedMotionDocument = (globalThis as { document?: ReducedMotionDocument }).document;
const ReducedMotionObserver = Reflect.get(globalThis, "MutationObserver") as unknown as ReducedMotionObserverConstructor | undefined;

// Read once at module load and cached — the query's `.matches` stays live. `null` where matchMedia
// doesn't exist (SSR / non-browser test runners); every consumer below degrades to `false`.
const reducedMotionQuery: ReducedMotionQuery | null = typeof matchMediaFn === "function" ? matchMediaFn("(prefers-reduced-motion: reduce)") : null;

function subscribeReducedMotion(onChange: () => void): () => void {
  reducedMotionQuery?.addEventListener("change", onChange);
  const root = reducedMotionDocument?.documentElement;
  const observer = root !== undefined && ReducedMotionObserver !== undefined ? new ReducedMotionObserver(onChange) : null;
  observer?.observe(root, { attributes: true, subtree: true, attributeFilter: ["data-reduced-motion"] });
  return (): void => {
    reducedMotionQuery?.removeEventListener("change", onChange);
    observer?.disconnect();
  };
}

function getReducedMotionSnapshot(): boolean {
  const appPreference = reducedMotionDocument?.querySelector('[data-reduced-motion="true"]');
  return (reducedMotionQuery === null ? false : reducedMotionQuery.matches) || (appPreference !== null && appPreference !== undefined);
}

/** Live OS OR app reduced-motion state, kept in sync via `useSyncExternalStore`. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot);
}
