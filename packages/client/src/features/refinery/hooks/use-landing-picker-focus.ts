// The refinery landing picker's focus-on-request hook (#307), the `use-composer-focus.ts` shape. On a
// desktop landing the sessions list's empty-state CTA bumps the landing-focus nonce
// (`requestRefineryLandingFocus`) INSTEAD of opening a second picker over the one CONTENT already mounts;
// this hook reads the nonce (`useRefineryLandingFocusRequest`) and, on every bump, scrolls its container
// into view and focuses the picker's search field. It returns the container ref `TeachingState` attaches
// to its root and the search ref it hands the shared `CharacterPicker`.

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { useRefineryLandingFocusRequest } from "#state";

/** Returns the two refs the landing attaches: the container to scroll into view and the picker's search field to
 *  focus, whenever the landing-focus nonce bumps (0 at mount ⇒ no focus stolen on first paint). */
export function useLandingPickerFocusOnRequest(): {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly searchRef: RefObject<HTMLInputElement | null>;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusNonce = useRefineryLandingFocusRequest();
  useEffect(() => {
    if (focusNonce > 0) {
      containerRef.current?.scrollIntoView({ block: "nearest" });
      searchRef.current?.focus();
    }
  }, [focusNonce]);
  return { containerRef, searchRef };
}
