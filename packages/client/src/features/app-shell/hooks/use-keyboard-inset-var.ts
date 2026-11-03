import { createKeyboardInsetReader, subscribeKeyboardInset } from "@orb/ui/lib";
import { useEffect } from "react";

// The custom property `shell.css` reads to shrink the frame above the soft keyboard. Private (`--orb-`),
// like every other var this app writes for its own plumbing rather than publishes as a token.
//
// NOT EXPORTED, and `knip` is right to insist: the only consumer is CSS, and CSS cannot import a TS
// constant. Exporting it would advertise a seam that does not exist and invite a second writer — the var has
// exactly one, by construction, which is what makes the removeProperty-on-cleanup contract below sound.
// The string is paired with `shell.css` by NAME; grep both when renaming.
const KEYBOARD_INSET_VAR = "--orb-keyboard-inset";
// The boolean twin CSS selects on (`globals.css`): a keyboard is up. Paired with the stylesheet by NAME too.
const KEYBOARD_UP_ATTRIBUTE = "data-keyboard-up";
const LAYOUT_HEIGHT_VAR = "--orb-layout-viewport-height";

/** Mirror keyboard coverage and visibility without rerendering the shell during native viewport transitions. */
export function useKeyboardInsetVar(): void {
  useEffect(() => {
    const root = document.documentElement;
    const read = createKeyboardInsetReader();
    let last = -1;
    let lastOpen = false;
    const apply = (): void => {
      // A registered length resolves 100dvh to pixels without measuring unrelated normal-flow content.
      const { inset, open } = read(Number.parseFloat(getComputedStyle(root).getPropertyValue(LAYOUT_HEIGHT_VAR)));
      // Guard the write, not just the value: a no-op setProperty still dirties style on an element the
      // whole shell inherits from, and iOS fires these events at frame rate while the keyboard animates.
      if (inset === last && open === lastOpen) {
        return;
      }
      last = inset;
      lastOpen = open;
      root.toggleAttribute(KEYBOARD_UP_ATTRIBUTE, open);
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
      root.removeAttribute(KEYBOARD_UP_ATTRIBUTE);
    };
  }, []);
}
