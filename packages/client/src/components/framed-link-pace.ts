// How fast a routed frame's links may raise the link confirm after the reader cancels it (D354).
//
// The host cannot tell a reader's click from a script in the frame: both arrive as the same message from the frame's
// window, while the page holds a live activation and the focus gate has admitted the frame. After a Cancel the gate
// keeps focus out of the frame (`@orb/ui/sandbox-frame`), so its script must wait for the reader to click into it again; once they
// do, the script can post on that click. So the pace is the bound, not a mute: the first Cancels cost nothing, and each
// Cancel after them makes the frame's next link wait twice as long, up to a ceiling. The newest link that arrives inside
// the wait raises its confirm when the wait ends. An Open, or a remount, starts the count again.

/** Consecutive Cancels after which a frame's next link still raises the confirm at once. */
export const FRAMED_LINK_FREE_CANCELS = 2;
/** The wait after the first Cancel past {@link FRAMED_LINK_FREE_CANCELS}; each further Cancel doubles it. */
export const FRAMED_LINK_FIRST_WAIT_MS = 2000;
/** The longest a frame's next link waits, however many times the reader cancelled. */
const FRAMED_LINK_MAX_WAIT_MS = 30_000;

/** How long a frame's next link waits after `cancels` consecutive Cancels. */
export function framedLinkWaitMs(cancels: number): number {
  if (cancels <= FRAMED_LINK_FREE_CANCELS) {
    return 0;
  }
  return Math.min(FRAMED_LINK_MAX_WAIT_MS, FRAMED_LINK_FIRST_WAIT_MS * 2 ** (cancels - FRAMED_LINK_FREE_CANCELS - 1));
}
