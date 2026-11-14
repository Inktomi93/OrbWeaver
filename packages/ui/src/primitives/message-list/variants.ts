import { AVATAR_REACH_PADDING, HEIGHT, SCROLLER, tv } from "#lib";

// The transcript's scroller. A phone-width pane gives up its gutter here, so the bubbles take the room. A scrollbar that takes
// layout space is reserved on both edges, so the rows keep the middle of the scroller's box (`scrollbar-gutter.ts` sets the mark).
// A browser without `scrollbar-gutter` keeps the one gutter, and the published width still tells the door arithmetic.
export const messageListVariants = tv({
  base: [SCROLLER, "supports-[scrollbar-gutter:stable]:data-scrollbar-space:scrollbar-gutter-both"],
  variants: {
    height: { fill: HEIGHT.fill },
    // `avatarReach` pads the rows in by the avatar's touch reach, so a chip at the rows' edge keeps its whole reach inside the scroller's clip.
    paddingInlineNarrow: { avatarReach: AVATAR_REACH_PADDING },
  },
});
