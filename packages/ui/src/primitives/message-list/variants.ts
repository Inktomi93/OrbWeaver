import { HEIGHT, SCROLLER, tv } from "#lib";

// The transcript's scroller. A phone-width pane gives up its gutter here, so the bubbles take the room.
export const messageListVariants = tv({
  base: SCROLLER,
  variants: {
    height: { fill: HEIGHT.fill },
    // `chipReach` pads the rows in by one `block` step: a chip at the rows' edge keeps its whole 44px touch reach inside the
    // scroller's clip, which `tight` cut by six pixels.
    paddingInlineNarrow: { tight: "@max-cq-28:px-tight", chipReach: "@max-cq-28:px-block" },
  },
});
