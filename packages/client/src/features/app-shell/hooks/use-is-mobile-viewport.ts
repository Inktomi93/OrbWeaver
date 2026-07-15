// useIsMobileViewport / useIsShellNarrowViewport — the JS twins of shell.css's one viewport @media (plus
// a second, CSS-less breakpoint for auto-overlay). The shell is the sole layer allowed to be
// viewport-aware; features stay @container-only. useIsMobileViewport feeds the panel-resolve (a mobile
// sheet is transient device-state, not the persisted desktop dock) and the mobile-aware toggles.
// useIsShellNarrowViewport feeds resolvePanel's narrow-desktop auto-overlay regime (UI-Architecture-and-
// Layout.md §4.1) — it has NO matching CSS @media: overlay is mode-gated rendering (PanelChrome branches
// on data-panel-mode), not width-gated, so this stays the shell's one CSS @media.
//
// The 48rem/64rem literals are deliberately duplicated with shell.css where applicable (CSS can't read a
// JS const, and a viewport breakpoint is a distinct axis from the @container tokens).

import { useSyncExternalStore } from "react";

/** Must match shell.css `@media (max-width: 48rem)`. */
const MOBILE_QUERY = "(max-width: 48rem)";

/** The shell-narrow breakpoint (UI-Architecture-and-Layout.md §4.1) — wider than `MOBILE_QUERY`, no CSS
 *  counterpart (see file header). */
const SHELL_NARROW_QUERY = "(max-width: 64rem)";

const noop = (): void => undefined;

function subscribeTo(query: string): (onChange: () => void) => () => void {
  return (onChange: () => void): (() => void) => {
    if (typeof globalThis.matchMedia !== "function") {
      return noop;
    }
    const mql = globalThis.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

function snapshotOf(query: string): () => boolean {
  return (): boolean => {
    if (typeof globalThis.matchMedia !== "function") {
      return false;
    }
    return globalThis.matchMedia(query).matches;
  };
}

const subscribeMobile = subscribeTo(MOBILE_QUERY);
const getMobileSnapshot = snapshotOf(MOBILE_QUERY);
const subscribeNarrow = subscribeTo(SHELL_NARROW_QUERY);
const getNarrowSnapshot = snapshotOf(SHELL_NARROW_QUERY);

/** `true` when the viewport is at/below the shell's mobile breakpoint (the bottom-tab-bar layout). */
export function useIsMobileViewport(): boolean {
  return useSyncExternalStore(subscribeMobile, getMobileSnapshot, () => false);
}

/** `true` when the viewport is at/below the shell-narrow breakpoint (48–64rem is narrow-desktop; a
 *  `mobileViewport` reading is also `narrowViewport`, but `resolvePanel` checks `isMobile` first so
 *  precedence never depends on that overlap). */
export function useIsShellNarrowViewport(): boolean {
  return useSyncExternalStore(subscribeNarrow, getNarrowSnapshot, () => false);
}
