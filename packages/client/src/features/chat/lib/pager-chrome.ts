// THE SWIPE FOOT — the message's own last line: ‹ `n / m` › grouped at its trailing corner. It is part of the
// message, never a separate card under it, so it costs one glyph-row of height and no plate of its own inside a container. Each chat style says WHERE the foot sits and how its
// chevrons meet the edge through `RowSkin.swipeFoot` (message-row-variants.ts); the two strips
// (`swipe-strip.tsx`, `greeting-swipe-strip.tsx`) read the same treatment, so to a reader they are one gesture.

import { BG_PHOTO_PAGER_PLATE } from "./message-row-backing.ts";

/** One chat style's swipe foot. */
export interface SwipeFoot {
  /** `inside` renders the foot as the container's last line (the header's twin, #288: one object, not two);
   *  `below` renders it under the body in the content column, for a skin with no single container. */
  readonly placement: "inside" | "below";
  /** The foot line itself: how far its chevrons reach past the container's reading inset, and any backing. */
  readonly row: string;
  /** The chevrons' ink. */
  readonly chevron: string;
}

// An inside foot never sets its container's width: `contain: inline-size` takes it out of a shrink-to-fit
// bubble's intrinsic width, so a "Hi." bubble stays as narrow as its header and the foot stretches to fit.
const FOOT_INSIDE_WIDTH = "contain-inline-size";

/** Every single-container style: the foot sits on the container's reading inset, the same inset the header
 *  bar's actions sit on, so the message's top and bottom edges line up glyph for glyph. */
export const SWIPE_FOOT_INSIDE: SwipeFoot = { placement: "inside", row: FOOT_INSIDE_WIDTH, chevron: "text-muted-foreground" };

/** Echo: the foot reaches across the art pane on the card's fill, as the pinned header bar does
 *  (`--row-reach-*`, row-edges.ts), down to the card's bottom edge. Its group ends at the card's corner: the inset
 *  it keeps on each side is `--row-foot-inset-*`, set to the card inset in globals.css. */
export const SWIPE_FOOT_ECHO: SwipeFoot = {
  placement: "inside",
  row: `${FOOT_INSIDE_WIDTH} -ml-(--row-reach-left) pl-(--row-foot-inset-left) -mr-(--row-reach-right) pr-(--row-foot-inset-right) -mb-row rounded-b-card bg-ai-bubble`,
  chevron: "text-muted-foreground",
};

/** Tide's train of pills has no single container, so the foot runs under the train on the pager plate,
 *  which over a wallpaper is the only thing backing it. */
export const SWIPE_FOOT_TRAIN: SwipeFoot = { placement: "below", row: `${BG_PHOTO_PAGER_PLATE} px-field`, chevron: "text-muted-foreground" };

/** The count: a small tabular value beside the forward chevron. */
export const SWIPE_COUNTER = "whitespace-nowrap text-muted-foreground";
