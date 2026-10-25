// THE SWIPE FOOT — the message's own last line: ‹ `n / m` › grouped at its trailing corner. It is part of the
// message, never a separate card under it, so it costs one glyph-row of height and no plate of its own inside a
// container. Each chat style says where the foot sits and how its line meets the container's edge through
// `RowSkin.swipeFoot`; both strips (`swipe-strip.tsx`, `greeting-swipe-strip.tsx`) render it through one foot row.

/** One chat style's swipe foot. */
export interface SwipeFoot {
  /** `inside` renders the foot as the container's last line (the header's twin: one object, not two); `below`
   *  renders it under the body in the content column, for a skin with no single container. */
  readonly placement: "inside" | "below";
  /** `inset`: the foot sits on the container's reading inset, where the header's actions sit. `card`: it reaches
   *  across echo's art pane to the card's bottom edge on the card's fill, as the pinned header bar does. `plate`: under
   *  a train it carries the opaque pager plate, which over a wallpaper is the only thing backing it. */
  readonly edge: "inset" | "card" | "plate";
}

/** Every single-container style. */
export const SWIPE_FOOT_INSIDE: SwipeFoot = { placement: "inside", edge: "inset" };

/** Echo. */
export const SWIPE_FOOT_ECHO: SwipeFoot = { placement: "inside", edge: "card" };

/** Tide's train of pills has no single container. */
export const SWIPE_FOOT_TRAIN: SwipeFoot = { placement: "below", edge: "plate" };
