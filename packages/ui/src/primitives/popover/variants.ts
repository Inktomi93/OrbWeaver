import { OVERLAY_ARROW, OVERLAY_MOTION, SCRIM, tv } from "#lib";

/**
 * Slot classes for the popover stack (ui-package-design §5). Positioner carries `--z-overlay`;
 * popup animates on Base UI's `data-starting-style`/`data-ending-style`.
 */
export const popoverVariants = tv({
  slots: {
    positioner: "z-(--z-popover)",
    backdrop: SCRIM("popover"),
    popup: `max-w-cq-sm rounded-card border border-border bg-popover p-block text-popover-foreground shadow-overlay ${OVERLAY_MOTION.anchoredPopup}`,
    arrow: OVERLAY_ARROW,
    title: "text-title leading-title font-semibold",
    description: "mt-field text-body leading-body text-muted-foreground",
  },
});
