// useIsMobileViewport / useIsShellNarrowViewport — the JS twins of shell.css's one viewport @media, plus
// the rendered shell-geometry observer for content primacy. The shell is the sole layer allowed to be
// viewport-aware; features stay @container-only. useIsMobileViewport feeds the panel-resolve (a mobile
// sheet is transient device-state, not the persisted desktop dock) and the mobile-aware toggles.
// useIsShellNarrowViewport feeds resolvePanel's narrow-desktop auto-overlay regime (UI-Architecture-and-
// UI-Architecture-and-Layout.md §4.1) — it has NO matching CSS @media: overlay is mode-gated rendering (PanelChrome branches
// on data-panel-mode), not width-gated, so this stays the shell's one CSS @media.
//
// The 48rem/64rem literals are deliberately duplicated with shell.css where applicable (CSS can't read a
// JS const, and a viewport breakpoint is a distinct axis from the @container tokens). Content primacy is
// different: shell.css owns its track arithmetic and exposes the live deficit as a sentinel's rendered
// width. JS observes that result; it never respells tokens, root pixels, clamps, or a crossover.
// useIsBelowShellContentFloor is the third kind — a viewport read against a rem TOKEN rather than a
// breakpoint literal, so it resolves the token instead of querying it (its own doc block states why).

import { snappedLengthPx, TOKENS } from "@orb/ui/tokens";
import type { RefObject } from "react";
import { useLayoutEffect, useSyncExternalStore } from "react";

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

/** The reader's chat-width floor, READ from the vault rather than re-spelled: the shell stamps the same
 *  token into `--width-shell-content`'s clamp, so there is exactly one number. */
const SHELL_CONTENT_FLOOR = TOKENS["dimension.shell-content-floor"].value;

/** Memoized because `getSnapshot` runs on every render of every consumer and the read is a forced style
 *  recalc; the subscription owns invalidation (the `contextContentConstrained` store's shape). */
let belowShellContentFloor: boolean | null = null;

function readBelowShellContentFloor(): boolean {
  if (typeof globalThis.getComputedStyle !== "function") {
    return false;
  }
  const rootFontSizePx = Number.parseFloat(globalThis.getComputedStyle(document.documentElement).fontSize);
  if (!Number.isFinite(rootFontSizePx)) {
    return false;
  }
  // `snappedLengthPx` is the token pipeline's own inverse of the emitted length (#1640) — the decoder, not
  // a re-spelling of `46.125 * root`.
  const floorPx = snappedLengthPx(SHELL_CONTENT_FLOOR, rootFontSizePx);
  return floorPx !== null && globalThis.innerWidth <= floorPx;
}

function subscribeShellContentFloor(onChange: () => void): () => void {
  if (typeof globalThis.addEventListener !== "function") {
    return noop;
  }
  const publish = (): void => {
    const next = readBelowShellContentFloor();
    if (next !== belowShellContentFloor) {
      belowShellContentFloor = next;
      onChange();
    }
  };
  // A late subscriber inherits whatever the last publish cached, so re-read once on attach.
  publish();
  globalThis.addEventListener("resize", publish);
  // `--font-scale` lands on the root's `style` attribute (use-appearance-root-effects.ts) and moves the
  // floor without moving the viewport, so `resize` alone would miss it.
  const rootStyle = new MutationObserver(publish);
  rootStyle.observe(document.documentElement, { attributeFilter: ["style"] });
  return (): void => {
    globalThis.removeEventListener("resize", publish);
    rootStyle.disconnect();
  };
}

function getShellContentFloorSnapshot(): boolean {
  belowShellContentFloor ??= readBelowShellContentFloor();
  return belowShellContentFloor;
}

let contextContentConstrained = false;
const contextContentListeners = new Set<() => void>();

function publishContextContentConstrained(next: boolean): void {
  if (contextContentConstrained === next) {
    return;
  }
  contextContentConstrained = next;
  for (const listener of contextContentListeners) {
    listener();
  }
}

function subscribeContextContentConstrained(onChange: () => void): () => void {
  contextContentListeners.add(onChange);
  return (): void => {
    contextContentListeners.delete(onChange);
  };
}

function getContextContentConstrainedSnapshot(): boolean {
  return contextContentConstrained;
}

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

/** Own the observation of shell.css's rendered sentinel. The one synchronous mount read happens in a
 * layout effect so hydration never paints the provisional docked arm. ResizeObserver delivers viewport,
 * root font/preset, and token/track changes; the FontFaceSet readiness seam re-samples after late font
 * loads. The sentinel is mode-independent, so publishing the answer cannot resize it and form a loop. */
export function useShellContentPrimacyObserver(sentinelRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null) {
      return;
    }
    const publish = (inlineSize: number): void => {
      publishContextContentConstrained(inlineSize > 0);
    };
    const publishRenderedWidth = (): void => {
      publish(sentinel.getBoundingClientRect().width);
    };

    // One pre-paint read seeds the hydration arm. The observer owns subsequent geometry invalidations.
    publishRenderedWidth();
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        publish(entry.contentRect.width);
      }
    });
    observer.observe(sentinel);
    let mounted = true;
    const onFontsLoaded = (): void => {
      if (mounted) {
        publishRenderedWidth();
      }
    };
    document.fonts.addEventListener("loadingdone", onFontsLoaded);
    // @orb-waive caught-failure-ownership(document.fonts.ready): fonts.ready never rejecting in practice, and the
    // "loadingdone" listener above already re-fires onFontsLoaded on the real completion signal. Ends if fonts.ready
    // starts rejecting on a real load failure this listener would miss.
    document.fonts.ready.then(onFontsLoaded, () => undefined);
    return (): void => {
      mounted = false;
      document.fonts.removeEventListener("loadingdone", onFontsLoaded);
      observer.disconnect();
      publishContextContentConstrained(false);
    };
  }, [sentinelRef]);
}

export function useIsContextContentConstrained(): boolean {
  return useSyncExternalStore(subscribeContextContentConstrained, getContextContentConstrainedSnapshot, () => false);
}

/** `true` when the viewport is at/below `dimension.shell-content-floor` — the width at which the reader's
 *  chat-width dial is DEAD (#1871 item 4, owner ruling 2026-09-19). `--width-shell-content` is
 *  `clamp(<floor>, <chatWidthPct>dvw, 100dvw)`, so once the viewport reaches the floor even the 100% end of
 *  the dial resolves to the floor and every position paints the same track. The dial's own section hides it
 *  here rather than offering a control that cannot move.
 *
 *  WHY THIS IS NOT A `rem` matchMedia like the two above: `rem` inside a media query resolves against the
 *  INITIAL root font-size, never the live one, and this floor's whole point is that it rides
 *  `--font-scale` (`:root { font-size: calc(100% * var(--font-scale)) }`) exactly like the `ch` measure it
 *  was derived from. The two queries above CAN be rem because each is the JS twin of a CSS `@media` that
 *  resolves rem the same way; this one has no CSS twin and must agree with a `clamp()` instead. So the
 *  threshold is resolved through the token's own generated decoder against the LIVE root font-size, and the
 *  root `style` attribute — the one carrier of `--font-scale` (`use-appearance-root-effects.ts`) — is
 *  observed beside `resize`. An unreadable root font-size answers `false`: an unmeasurable floor must not
 *  take a working control away. */
export function useIsBelowShellContentFloor(): boolean {
  return useSyncExternalStore(subscribeShellContentFloor, getShellContentFloorSnapshot, () => false);
}
