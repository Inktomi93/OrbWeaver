// A room's reading surface ends where its composer begins. While a room is mounted on a touch phone the shell's notice stack
// sits above that edge, so a turn notice lies over the last rows, never over the room header, the character bar or the rows
// at the top, and never over the composer a failed send needs.

import type { RefObject } from "react";
import { useLayoutEffect } from "react";

// Paired with `chrome.css` by NAME, like the other `--orb-` vars this app writes for its own plumbing; the attribute tells the
// sheet a room has published the var, so every other surface keeps the stack under the chrome.
const NOTICE_FLOOR_VAR = "--orb-notice-floor";
const NOTICE_FLOOR_ATTRIBUTE = "data-notice-floor";

/** Publish how far the composer region's top stands above the bottom of the viewport. The thread is watched too: it is what
 *  gives up its height when the soft keyboard lifts the composer without resizing it. The region mounts with the room's chrome, so `enabled` waits for it. */
export function useNoticeFloor(regionRef: RefObject<HTMLElement | null>, threadRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  useLayoutEffect(() => {
    const region = regionRef.current;
    const thread = threadRef.current;
    if (!enabled || region === null || thread === null) {
      return;
    }
    const root = document.documentElement;
    const publish = (): void => {
      root.style.setProperty(NOTICE_FLOOR_VAR, `${String(root.clientHeight - region.getBoundingClientRect().top)}px`);
    };
    root.setAttribute(NOTICE_FLOOR_ATTRIBUTE, "");
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(region);
    observer.observe(thread);
    window.addEventListener("resize", publish);
    return (): void => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty(NOTICE_FLOOR_VAR);
      root.removeAttribute(NOTICE_FLOOR_ATTRIBUTE);
    };
  }, [regionRef, threadRef, enabled]);
}
