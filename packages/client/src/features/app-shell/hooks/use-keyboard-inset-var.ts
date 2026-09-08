import { readKeyboardInset, subscribeKeyboardInset } from "@orb/ui/lib";
import { useEffect } from "react";

// The custom property `shell.css` reads to shrink the frame above the soft keyboard. Private (`--orb-`),
// like every other var this app writes for its own plumbing rather than publishes as a token.
//
// NOT EXPORTED, and `knip` is right to insist: the only consumer is CSS, and CSS cannot import a TS
// constant. Exporting it would advertise a seam that does not exist and invite a second writer — the var has
// exactly one, by construction, which is what makes the removeProperty-on-cleanup contract below sound.
// The string is paired with `shell.css` by NAME; grep both when renaming.
const KEYBOARD_INSET_VAR = "--orb-keyboard-inset";

/**
 * Mirrors the live virtual-keyboard inset onto the document root as `--orb-keyboard-inset` (#1869).
 *
 * WHY THE SHELL OWNS THE WRITE AND `@orb/ui` OWNS THE MEASUREMENT: `keyboard-inset.ts` is a platform
 * capability reader with no idea who consumes it (the `coarse-pointer-now` species); knowing that the
 * consumer is `.shell-grid`'s height, and that the carrier is a root custom property, is shell-tier
 * knowledge. `use-appearance-root-effects.ts` is the same write pattern one axis over, and §4b axis 3/4 put
 * every capability and platform mechanism at the shell/token layer rather than in a feature.
 *
 * IT WRITES IMPERATIVELY AND HOLDS NO REACT STATE, deliberately. iOS fires `resize`+`scroll` on the visual
 * viewport continuously while the keyboard animates in; routing that through `useState` would re-render the
 * entire shell tree on every frame of a keyboard opening — the shell whose panel motion is compositor-only
 * precisely so it never re-lays-out under animation. A custom property write is a style recalculation on one
 * element and nothing above it. Base UI's own `DrawerVirtualKeyboardProvider` writes its inset the same way.
 *
 * THE PROPERTY IS REMOVED ON CLEANUP, WHICH IS WHY EVERY READER MUST SPELL `var(--orb-keyboard-inset, 0px)`
 * WITH THE FALLBACK. Base UI's drawer docs make exactly this point about `--drawer-keyboard-inset`: the
 * value only exists while a keyboard is being tracked, so a bare `var()` is invalid before the first write
 * and after teardown, and an invalid `var()` in a `calc()` takes the whole declaration with it.
 *
 * NO INSTRUMENT WE OWN CAN VERIFY THIS. Headless Chromium has no on-screen keyboard, so CT, snap and
 * design-audit all measure a permanent inset of 0 — a passing test here would prove only that the no-keyboard
 * path is inert, which is the half that was never in doubt. What CAN be pinned is the arithmetic
 * (`readKeyboardInset` against a faked `visualViewport`), and the rendered proof needs a real device.
 */
export function useKeyboardInsetVar(): void {
  useEffect(() => {
    const root = document.documentElement;
    let last = -1;
    const apply = (): void => {
      const inset = readKeyboardInset();
      // Guard the write, not just the value: a no-op setProperty still dirties style on an element the
      // whole shell inherits from, and iOS fires these events at frame rate while the keyboard animates.
      if (inset === last) {
        return;
      }
      last = inset;
      if (inset === 0) {
        root.style.removeProperty(KEYBOARD_INSET_VAR);
        return;
      }
      root.style.setProperty(KEYBOARD_INSET_VAR, `${inset}px`);
    };
    apply();
    const unsubscribe = subscribeKeyboardInset(apply);
    return (): void => {
      unsubscribe();
      root.style.removeProperty(KEYBOARD_INSET_VAR);
    };
  }, []);
}
