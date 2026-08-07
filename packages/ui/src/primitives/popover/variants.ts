import { OVERLAY_ARROW, OVERLAY_MOTION, SCRIM, tv } from "#lib";

/**
 * Slot classes for the popover stack (ui-package-design §5). Positioner carries `--z-overlay`;
 * popup animates on Base UI's `data-starting-style`/`data-ending-style`.
 */
export const popoverVariants = tv({
  slots: {
    positioner: "z-(--z-popover)",
    backdrop: SCRIM("popover"),
    // `max-h-(--available-height)` mirrors the existing `max-w-cq-sm` cap on the other axis: Base UI's
    // Positioner publishes the space left between the anchor and the viewport edge, and a tall popover
    // body (a form, a settings stack) that ignores it overflows the viewport with no way to reach the
    // bottom. Capped + scrollable is the same contract `POPUP_SURFACE` gives the list seals.
    popup: `max-h-(--available-height) max-w-cq-sm overflow-y-auto overscroll-contain rounded-card border border-border bg-popover p-block text-popover-foreground shadow-overlay ${OVERLAY_MOTION.anchoredPopup}`,
    arrow: OVERLAY_ARROW,
    title: "text-title leading-title font-semibold",
    description: "mt-field text-body leading-body text-muted-foreground",
  },
});
