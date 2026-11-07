import { HEIGHT, SCROLLER, tv } from "#lib";

// The transcript's scroller. A phone-width pane gives up its gutter here, so the bubbles take the room.
export const messageListVariants = tv({
  base: SCROLLER,
  variants: {
    height: { fill: HEIGHT.fill },
    paddingInlineNarrow: { tight: "@max-cq-28:px-tight" },
  },
});
