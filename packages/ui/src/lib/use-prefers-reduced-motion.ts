import { useSyncExternalStore } from "react";
import { MEDIA_QUERIES } from "#tokens";
import type { ReducedMotionRoot } from "./reduced-motion-now.ts";
import { APP_REDUCED_MOTION_ATTRIBUTE, resolveReducedMotion } from "./reduced-motion-now.ts";

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
  readonly documentElement?: ReducedMotionRoot;
}
interface ReducedMotionObserver {
  readonly observe: (target: unknown, options: { readonly attributes: true; readonly attributeFilter: readonly string[] }) => void;
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
const reducedMotionQuery: ReducedMotionQuery | null = typeof matchMediaFn === "function" ? matchMediaFn(MEDIA_QUERIES["motion-reduce"]) : null;

function subscribeReducedMotion(onChange: () => void): () => void {
  reducedMotionQuery?.addEventListener("change", onChange);
  const root = reducedMotionDocument?.documentElement;
  const observer = root !== undefined && ReducedMotionObserver !== undefined ? new ReducedMotionObserver(onChange) : null;
  observer?.observe(root, { attributes: true, attributeFilter: [APP_REDUCED_MOTION_ATTRIBUTE] });
  return (): void => {
    reducedMotionQuery?.removeEventListener("change", onChange);
    observer?.disconnect();
  };
}

function getReducedMotionSnapshot(): boolean {
  return resolveReducedMotion(reducedMotionDocument?.documentElement, reducedMotionQuery?.matches ?? false);
}

/** The live resolved reduced-motion state (the app's setting over the OS query), kept in sync via `useSyncExternalStore`. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot);
}
