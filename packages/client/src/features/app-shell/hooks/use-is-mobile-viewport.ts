// useIsMobileViewport — the JS twin of shell.css's ONE viewport `@media` (§4b axis 2). The shell is the
// sole layer allowed to be viewport-aware; features stay `@container`-only. The reflow itself is pure CSS
// (shell.css `@media (max-width: 48rem)`), but two mobile behaviours need the SAME breakpoint in JS: the
// panel resolve (a mobile sheet is transient device-state, not the persisted desktop dock — use-shell-
// layout.ts) and the mobile-aware toggle callbacks. This hook is that seam, living in the shell tier where
// viewport-awareness is legal.
//
// The `48rem` literal is DELIBERATELY duplicated with shell.css (they cite each other): CSS can't read a
// JS const, and a viewport breakpoint is a shell-only concept — the `--container-cq-*` tokens are
// `@container` breakpoints (a DISTINCT one-home concept per tokens.json), so reusing one here would
// conflate two axes. No new token is minted for a single shell-private literal (D62 coordinator ruling).
//
// `useSyncExternalStore` over `matchMedia` — the tearing-free React 18/19 idiom for an external boolean.
// SSR/test-safe: `matchMedia` absent ⇒ `false` (desktop), never a crash.

import { useSyncExternalStore } from "react";

/** The shell's mobile breakpoint — MUST match shell.css `@media (max-width: 48rem)` (they cite each other). */
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
  // getServerSnapshot === getSnapshot: the desktop-default (`false`) is a safe hydration baseline; a real
  // mobile viewport corrects on the first client effect (no layout committed on the server here anyway).
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
