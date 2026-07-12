import { OVERLAY_MOTION, tv } from "#lib";

/**
 * Slot classes for the popover stack (ui-package-design §5). Positioner carries `--z-overlay`;
 * popup animates on Base UI's `data-starting-style`/`data-ending-style`.
 */
export const popoverVariants = tv({
  slots: {
    positioner: "z-(--z-popover)",
    backdrop: `fixed inset-0 z-(--z-popover) bg-scrim ${OVERLAY_MOTION.backdropFade("fast")}`,
    popup: `max-w-cq-sm rounded-card border border-border bg-popover p-block text-popover-foreground shadow-overlay ${OVERLAY_MOTION.anchoredPopup}`,
    // Base UI positions the arrow against the anchor and sets data-side; we skin it as a rotated
    // bordered square that reads as the popup edge continuing to a point.
    arrow: "size-row rotate-45 border border-border bg-popover",
    title: "text-title leading-title font-semibold",
    description: "mt-field text-body leading-body text-muted-foreground",
  },
});
