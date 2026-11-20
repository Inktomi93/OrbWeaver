// The open panels a reader left in each framed document this tab drew, so a fresh document for the same frame (a
// scroll back into a virtualized transcript, a swipe back to a variant) opens them again. The frame's pinned script
// reports them (`@orb/kit/card-frame`); the host keeps the last report and sends it in the next mint's root
// attributes. Memory only: a reload starts every panel as its author wrote it.
//
// A report is UNTRUSTED: an interactive card's script can post any list. The kit parse bounds it, and the worst a
// forged report buys is which of the frame's own panels open in its next document.

import type { CardFrameMintRequest } from "@orb/contracts/chat";
import { rememberBounded } from "./bounded-memo.ts";

/** Whose frame a report belongs to: the mint's policy selector. Byte-identical runs under another room or character
 *  are another frame, drawn under another policy, so they never share a report. */
export type FramePanelsOrigin = Pick<CardFrameMintRequest, "chatId" | "characterId">;

const openPanels = new Map<string, readonly number[]>();

// Keys are whole serialized runs, so the cap stays near the replies a transcript holds framed at once.
const FRAME_PANELS_CAP = 64;

function panelsKey(origin: FramePanelsOrigin, bytes: string): string {
  return JSON.stringify([origin.chatId, origin.characterId, bytes]);
}

/** The open panels last reported for a frame of these bytes under this origin, or `undefined` when none was reported. */
export function readFramePanels(origin: FramePanelsOrigin, bytes: string): readonly number[] | undefined {
  return openPanels.get(panelsKey(origin, bytes));
}

/** Keep a frame's latest panels report under its origin and its document's bytes. */
export function rememberFramePanels(origin: FramePanelsOrigin, bytes: string, panels: readonly number[]): void {
  rememberBounded(openPanels, panelsKey(origin, bytes), panels, FRAME_PANELS_CAP);
}
