import { COLOR_MOTION, FOCUS_RING_INSET, GROW, MAX_HEIGHT, tv } from "#lib";

/**
 * Slot classes for the scroll-area (ui-package-design §5). Base UI hands us hover/scroll state on
 * the scrollbar and sizes the thumb via `--scroll-area-thumb-*`; we only skin it. The scrollbar
 * width/height rides the `--spacing-row` token off `data-orientation`; the thumb is a subtle
 * `muted-foreground` rail that firms on hover. `overscroll-contain` keeps scroll chaining out of
 * the parent — the region behaves as its own scroll boundary.
 */
export const scrollAreaVariants = tv({
  slots: {
    root: "relative overflow-hidden",
    viewport: `overscroll-contain outline-none block-full inline-full ${FOCUS_RING_INSET}`,
    // The sized content wrapper — min-w-max lets horizontal overflow measure past the viewport.
    content: "min-inline-max",
    scrollbar: `
      flex touch-none bg-transparent select-none
      data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:block-row
      data-[orientation=vertical]:inline-row
    `,
    thumb: `flex-1 rounded-full bg-muted-foreground ${COLOR_MOTION} hover:bg-foreground`,
    // The square where the two scrollbars meet — Base UI shows it only on both-axis overflow.
    corner: "bg-transparent",
  },
});

export const scrollAreaBoxVariants = tv({
  variants: {
    grow: GROW,
    // The viewport bounds the scroll, for an area that holds a list of its own height.
    maxHeight: MAX_HEIGHT,
  },
});
