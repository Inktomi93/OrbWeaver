// useIsMobileViewport — the JS twin of shell.css's one viewport @media. The shell is the sole layer
// allowed to be viewport-aware; features stay @container-only. This hook feeds the panel-resolve (a
// mobile sheet is transient device-state, not the persisted desktop dock) and the mobile-aware toggles.
//
// The 48rem literal is deliberately duplicated with shell.css (CSS can't read a JS const, and a viewport
// breakpoint is a distinct axis from the @container tokens).

import { useSyncExternalStore } from "react";

/** Must match shell.css `@media (max-width: 48rem)`. */
const MOBILE_QUERY = "(max-width: 48rem)";

const noop = (): void => undefined;

function subscribe(onChange: () => void): () => void {
  if (typeof globalThis.matchMedia !== "function") {
    return noop;
  }
  const mql = globalThis.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof globalThis.matchMedia !== "function") {
    return false;
  }
  return globalThis.matchMedia(MOBILE_QUERY).matches;
}

/** `true` when the viewport is at/below the shell's mobile breakpoint (the bottom-tab-bar layout). */
export function useIsMobileViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
