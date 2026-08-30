// config-jump — the CONTENT pane's programmatic-scroll helpers (moved VERBATIM from the retired settings
// shell surface, #866 S1): suppress the spy for the duration of a jump, scroll to the top of a group, and
// scroll to a section's anchor once the group's DOM has it. Module-scope over the two refs, so the host's
// deep-link effect can call them without taking a per-render closure as a dependency (D54 bans manual memo,
// and an in-component definition would re-arm the effect every render). The spy's WHAT (where the reader
// is, the flash) lives in `config-scroll-spy.ts`; this file owns the WHEN of a jump.

import { scrollBehavior } from "@orb/ui/lib";
import type { RefObject } from "react";
import type { ConfigGroupId } from "#state";
import { configAnchorId } from "#state";
import { afterPaint, flashAnchor } from "./config-scroll-spy.ts";

// Wall-clock bound for the anchor-appearance observer (a suspending group can outlast any frame count under
// contention; frames are not time). Generous — the observer fires the instant the anchor mounts, so the
// bound only matters when the group never resolves at all.
const ANCHOR_WAIT_MS = 5000;
const SPY_REARM_FALLBACK_MS = 700;

/** Suppress the scroll-spy for the duration of a programmatic jump so smooth-scroll can't flicker the LIST.
 *  Re-arms on the container's `scrollend`, with a wall-clock fallback for a jump that never scrolls. */
function beginProgrammaticScroll(contentRef: RefObject<HTMLDivElement | null>, suppressSpyRef: RefObject<boolean>): void {
  suppressSpyRef.current = true;
  const container = contentRef.current;
  const rearm = (): void => {
    suppressSpyRef.current = false;
  };
  container?.addEventListener("scrollend", rearm, { once: true });
  globalThis.setTimeout(rearm, SPY_REARM_FALLBACK_MS);
}

/** Scroll the CONTENT scroller back to its top — deferred a frame like every other programmatic scroll here
 *  (see {@link afterPaint}). */
export function scrollContentToTop(contentRef: RefObject<HTMLDivElement | null>, suppressSpyRef: RefObject<boolean>): void {
  beginProgrammaticScroll(contentRef, suppressSpyRef);
  afterPaint((): void => contentRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() }));
}

/**
 * Jump to a section anchor inside the CONTENT scroller. Switching group remounts the body, which may SUSPEND
 * on its settings read — under CPU contention the resolve can outlast any frame budget, and the old 20-frame
 * rAF poll silently gave up without ever scrolling (the fuzzy-search jump flake, root-caused 2026-07-24).
 * Observe the pane's DOM until the anchor exists (wall-clock-bounded) instead of guessing frames.
 */
export function scrollToAnchor(groupId: ConfigGroupId, subId: string, contentRef: RefObject<HTMLDivElement | null>, suppressSpyRef: RefObject<boolean>): void {
  beginProgrammaticScroll(contentRef, suppressSpyRef);
  const anchorId = configAnchorId(groupId, subId);
  const container = contentRef.current;
  if (container === null) {
    return;
  }
  const find = (): HTMLElement | null => container.querySelector<HTMLElement>(`#${CSS.escape(anchorId)}`);
  const existing = find();
  if (existing !== null) {
    afterPaint((): void => flashAnchor(existing));
    return;
  }
  let done = false;
  const finish = (target: HTMLElement | null): void => {
    if (done) {
      return;
    }
    done = true;
    observer.disconnect();
    globalThis.clearTimeout(timer);
    if (target !== null) {
      afterPaint((): void => flashAnchor(target));
    }
  };
  const observer = new MutationObserver((): void => {
    const target = find();
    if (target !== null) {
      finish(target);
    }
  });
  const timer = globalThis.setTimeout((): void => finish(null), ANCHOR_WAIT_MS);
  observer.observe(container, { childList: true, subtree: true });
}
