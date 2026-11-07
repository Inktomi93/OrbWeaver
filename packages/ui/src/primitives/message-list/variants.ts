import { FILL, SCROLLER, tv } from "#lib";

// The transcript's scroller. A phone-width pane gives up its gutter here, so the bubbles take the room.
export const messageListVariants = tv({
  base: SCROLLER,
  variants: {
    fill: FILL,
    paddingInlineNarrow: { tight: "@max-cq-28:px-tight" },
  },
});
