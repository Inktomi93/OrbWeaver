import { GROW, HEIGHT, MAX_HEIGHT, SCROLLER_CHAINED, tv } from "#lib";

// The list scrolls inside a bounded box: every axis here is one way to bound it, and the parent's own bound is the other.
export const virtualListVariants = tv({
  base: SCROLLER_CHAINED,
  variants: {
    grow: GROW,
    height: { fill: HEIGHT.fill, scrollMd: HEIGHT.scrollMd },
    maxHeight: { scrollLg: MAX_HEIGHT.scrollLg },
  },
});
