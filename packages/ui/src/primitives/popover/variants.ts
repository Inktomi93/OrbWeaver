import { MAX_HEIGHT, OVERLAY_ARROW, OVERLAY_MOTION, POPUP_DESCRIPTION, SCRIM, SCROLLER_Y, TITLE_STEP, tv } from "#lib";

/**
 * Slot classes for the popover stack (ui-package-design §5). Positioner carries `--z-popover`;
 * popup animates on Base UI's `data-starting-style`/`data-ending-style`.
 */
export const popoverVariants = tv({
  slots: {
    positioner: "z-(--z-popover)",
    backdrop: SCRIM("popover"),
    // `max-h-(--available-height)` mirrors the existing `max-w-cq-24` cap on the other axis: Base UI's
    // Positioner publishes the space left between the anchor and the viewport edge, and a tall popover
    // body (a form, a settings stack) that ignores it overflows the viewport with no way to reach the
    // bottom. Capped + scrollable is the same contract `POPUP_SURFACE` gives the list seals.
    popup: `
      ${SCROLLER_Y}
      rounded-card border border-border bg-popover p-block text-popover-foreground shadow-overlay max-block-(--available-height) max-inline-cq-24
      tone-host-popover
      ${OVERLAY_MOTION.anchoredPopup}
    `,
    arrow: OVERLAY_ARROW,
    title: TITLE_STEP,
    description: POPUP_DESCRIPTION,
  },
});

export const popoverPopupBoxVariants = tv({
  variants: {
    maxHeight: { available: MAX_HEIGHT.available },
  },
});
