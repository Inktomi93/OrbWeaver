import { AVATAR_REACH_PADDING, HEIGHT, SCROLLER, tv } from "#lib";

// The transcript's scroller. A phone-width pane gives up its gutter here, so the bubbles take the room.
export const messageListVariants = tv({
  base: SCROLLER,
  variants: {
    height: { fill: HEIGHT.fill },
    // `avatarReach` pads the rows in by the avatar's touch reach, so a chip at the rows' edge keeps its whole reach inside the scroller's clip.
    paddingInlineNarrow: { avatarReach: AVATAR_REACH_PADDING },
  },
});
