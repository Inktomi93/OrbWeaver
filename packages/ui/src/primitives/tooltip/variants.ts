import { OVERLAY_ARROW, OVERLAY_MOTION, tv } from "#lib";

/**
 * Slot classes for the tooltip stack (ui-package-design §5). Positioner carries `--z-tooltip`
 * (above every other layer); popup animates on `data-starting-style`/`data-ending-style`.
 */
export const tooltipVariants = tv({
  slots: {
    positioner: "z-(--z-tooltip)",
    popup: `rounded-control border border-border bg-popover px-row py-field text-label leading-label text-popover-foreground shadow-overlay ${OVERLAY_MOTION.anchoredPopup}`,
    arrow: OVERLAY_ARROW,
  },
});
