import { OVERLAY_ARROW, OVERLAY_MOTION, tv } from "#lib";

/**
 * Slot classes for the tooltip stack (ui-package-design §5). Positioner carries `--z-tooltip`
 * (above every other layer); popup animates on `data-starting-style`/`data-ending-style`.
 */
export const tooltipVariants = tv({
  slots: {
    positioner: "z-(--z-tooltip)",
    // The AT-REST description (#2455). `sr-only` is `position:absolute`, so this copy is out of flow: it
    // is not a flex/grid item anywhere a `<Tooltip>` is composed and costs its row no gap.
    description: "sr-only",
    popup: `rounded-control border border-border bg-popover px-row py-field text-label leading-label text-popover-foreground shadow-overlay ${OVERLAY_MOTION.anchoredPopup}`,
    arrow: OVERLAY_ARROW,
  },
});
