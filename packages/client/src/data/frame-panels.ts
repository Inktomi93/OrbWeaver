// The open panels a reader left in each framed document this tab drew, so a fresh document for the same bytes (a
// scroll back into a virtualized transcript, a swipe back to a variant) opens them again. The frame's pinned script
// reports them (`@orb/kit/card-frame`); the host keeps the last report and sends it in the next mint's root
// attributes. Memory only: a reload starts every panel as its author wrote it.
//
// A report is UNTRUSTED: an interactive card's script can post any list. The kit parse bounds it, and the worst a
// forged report buys is which of the frame's own panels open in its next document.

import { rememberBounded } from "./bounded-memo.ts";

const openPanels = new Map<string, readonly number[]>();

// Keys are whole serialized runs, so the cap stays near the replies a transcript holds framed at once.
const FRAME_PANELS_CAP = 64;

/** The open panels last reported for a framed document's bytes, or `undefined` when none was reported. */
export function readFramePanels(key: string): readonly number[] | undefined {
  return openPanels.get(key);
}

/** Keep a frame's latest panels report under its document's bytes. */
export function rememberFramePanels(key: string, panels: readonly number[]): void {
  rememberBounded(openPanels, key, panels, FRAME_PANELS_CAP);
}
