import { GROW, HEIGHT, MAX_HEIGHT, MIN_HEIGHT, SCROLLER_CHAINED, tv } from "#lib";

// The list scrolls inside a bounded box: every axis here is one way to bound it, and the parent's own bound is the other.
export const virtualListVariants = tv({
  base: SCROLLER_CHAINED,
  variants: {
    // A growing window is the parent's free space, never its rows (size containment), and never less than a few rows: a parent
    // whose chrome leaves less hands the list its floor and its own scroller carries it (ui-package-design §6.1).
    grow: { true: `${GROW.true} contain-size ${MIN_HEIGHT.scrollSm}`, false: GROW.false },
    height: { fill: HEIGHT.fill, scrollMd: HEIGHT.scrollMd },
    maxHeight: { scrollLg: MAX_HEIGHT.scrollLg },
  },
});
