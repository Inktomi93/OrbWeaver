// useIsMobileViewport / useIsShellNarrowViewport — the JS twins of shell.css's one viewport @media (plus
// CSS-less geometry queries for auto-overlay). The shell is the sole layer allowed to be
// viewport-aware; features stay @container-only. useIsMobileViewport feeds the panel-resolve (a mobile
// sheet is transient device-state, not the persisted desktop dock) and the mobile-aware toggles.
// useIsShellNarrowViewport feeds resolvePanel's narrow-desktop auto-overlay regime (UI-Architecture-and-
// Layout.md §4.1) — it has NO matching CSS @media: overlay is mode-gated rendering (PanelChrome branches
// on data-panel-mode), not width-gated, so this stays the shell's one CSS @media.
//
// The 48rem/64rem literals are deliberately duplicated with shell.css where applicable (CSS can't read a
// JS const, and a viewport breakpoint is a distinct axis from the @container tokens). The content-primacy
// crossover is different: appearance font scaling changes the resolved pane floors, so it is derived from
// the token registry rather than encoded as another viewport literal.

import { TOKENS } from "@orb/ui/tokens";
import { useSyncExternalStore } from "react";

/** Must match shell.css `@media (max-width: 48rem)`. */
const MOBILE_QUERY = "(max-width: 48rem)";

/** The shell-narrow breakpoint (UI-Architecture-and-Layout.md §4.1) — wider than `MOBILE_QUERY`, no CSS
 *  counterpart (see file header). */
const SHELL_NARROW_QUERY = "(max-width: 64rem)";

const UA_ROOT_PX = 16;

/** Read a generated rem token as the scalar used by the shell's track algebra. */
function tokenRem(token: keyof typeof TOKENS): number {
  return Number.parseFloat(TOKENS[token].value);
}

// THE CONTENT-PRIMACY CROSSOVER, derived from the tracks that shell.css actually resolves when its
// both-docked reading-floor squeeze binds: RAIL + LIST floor + CONTEXT step floor + their ruled mean.
// The 40rem reading floor is what spends each pane down to these minima before this crossover; at the
// crossover CONTENT owes the stricter local invariant `(LIST + CONTEXT) / 2`. No preset or viewport
// breakpoint appears in the result. `fontScale` below converts these rem tracks through the same root
// scale `useAppearanceRootEffects` stamps on <html>.
const LIST_FLOOR_REM = tokenRem("dimension.panel-floor");
const CONTEXT_FLOOR_REM = tokenRem("dimension.panel-context-step");
const BOTH_PANES_REM = LIST_FLOOR_REM + CONTEXT_FLOOR_REM;
const CONTENT_PRIMACY_VIEWPORT_REM = tokenRem("dimension.rail") + BOTH_PANES_REM + BOTH_PANES_REM / 2;

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

/** `true` when resolved both-docked pane floors would violate CONTENT primacy. Range syntax keeps exact
 * equality in the docked arm — equality passes the contract, so this is deliberately `<`, not `<=`. */
export function useIsContextContentConstrained(fontScale: number): boolean {
  const crossoverPx = CONTENT_PRIMACY_VIEWPORT_REM * UA_ROOT_PX * fontScale;
  const query = `(width < ${String(crossoverPx)}px)`;
  return useSyncExternalStore(subscribeTo(query), snapshotOf(query), () => false);
}
