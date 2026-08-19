// The refinery landing picker's focus-on-request hook (#307), the `use-composer-focus.ts` shape. On a
// desktop landing the sessions roster's empty-state CTA bumps the landing-focus nonce
// (`requestRefineryLandingFocus`) INSTEAD of opening a second picker over the one CONTENT already mounts;
// this hook reads the nonce (`useRefineryLandingFocusRequest`) and, on every bump, scrolls its container
// into view and focuses the picker's search field. It returns the container ref `TeachingState` attaches
// to its root: the picker's search box is the one `<input>` inside that subtree (the shared
// `CharacterPicker`'s `CommandInput`), so a querySelector on the OWNED subtree reaches it without threading
// a refinery-only focus prop through a component three other features share.

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { useRefineryLandingFocusRequest } from "#state";

/** Returns the container ref to attach to the landing picker's root; focuses+scrolls its search field
 *  whenever the landing-focus nonce bumps (0 at mount ⇒ no focus stolen on first paint). */
export function useLandingPickerFocusOnRequest(): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const focusNonce = useRefineryLandingFocusRequest();
  useEffect(() => {
    if (focusNonce > 0) {
      const container = containerRef.current;
      container?.scrollIntoView({ block: "nearest" });
      container?.querySelector("input")?.focus();
    }
  }, [focusNonce]);
  return containerRef;
}
