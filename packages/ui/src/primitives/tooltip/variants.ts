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
    // `max-w` is the prose measure: a tooltip sentence wraps at a readable line instead of spanning the
    // viewport over the rows beside its trigger.
    popup: `max-w-(--reading-measure-prose) rounded-control border border-border bg-popover px-row py-field text-label leading-label text-pretty text-popover-foreground shadow-overlay ${OVERLAY_MOTION.anchoredPopup}`,
    arrow: OVERLAY_ARROW,
  },
});
