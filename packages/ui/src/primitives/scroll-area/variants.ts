import { FOCUS_RING, tv } from "#lib";

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
    viewport: `overscroll-contain outline-none block-full inline-full ${FOCUS_RING}`,
    // The sized content wrapper — min-w-max lets horizontal overflow measure past the viewport.
    content: "min-inline-max",
    scrollbar: `
      flex touch-none bg-transparent select-none
      data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:block-row
      data-[orientation=vertical]:inline-row
    `,
    thumb: "flex-1 rounded-full bg-muted-foreground/40 transition-colors duration-(--motion-fast) ease-out-expo hover:bg-muted-foreground/60",
    // The square where the two scrollbars meet — Base UI shows it only on both-axis overflow.
    corner: "bg-transparent",
  },
});
