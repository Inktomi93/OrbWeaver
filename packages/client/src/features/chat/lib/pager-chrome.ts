// THE SWIPE FOOT — the message's own last line: ‹ at its leading edge, the `n / m` count and › at its
// trailing edge. It is part of the message, never a separate card under it, so it costs one glyph-row of
// height and no plate of its own inside a container. Each chat style says WHERE the foot sits and how its
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

/** Filled cards (bubble, echo, whisper, ripple): the chevrons hug the card's own edges. The pull is the
 *  card's `px-block` inset less a `row` step, so a glyph sits a hair inside the border rather than on it. */
export const SWIPE_FOOT_HUG: SwipeFoot = { placement: "inside", row: "-mx-row", chevron: "text-muted-foreground" };

/** Unboxed columns padded at `px-section` (flat, hush): the chevrons sit out in the column gutter, past the
 *  prose inset, so the reading measure carries nothing but prose and the count. */
export const SWIPE_FOOT_GUTTER_WIDE: SwipeFoot = { placement: "inside", row: "-mx-section", chevron: "text-muted-foreground" };

/** The document page, padded at `px-block`: the same gutter placement at the page's own inset. */
export const SWIPE_FOOT_GUTTER: SwipeFoot = { placement: "inside", row: "-mx-block", chevron: "text-muted-foreground" };

/** Tide's train of pills has no single container, so the foot runs under the train on the pager plate,
 *  which over a wallpaper is the only thing backing it. */
export const SWIPE_FOOT_TRAIN: SwipeFoot = { placement: "below", row: BG_PHOTO_PAGER_PLATE, chevron: "text-muted-foreground" };

/** The count: a small tabular value beside the forward chevron. */
export const SWIPE_COUNTER = "whitespace-nowrap text-muted-foreground";
