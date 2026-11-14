import { CAP, OVERLAY_ARROW, OVERLAY_MOTION, PASS_THROUGH, tv } from "#lib";

/**
 * Slot classes for the tooltip stack (ui-package-design §5). Positioner carries `--z-tooltip`
 * (above every other layer); popup animates on `data-starting-style`/`data-ending-style`.
 */
export const tooltipVariants = tv({
  slots: {
    // `pointer-events-none` inherits to the popup: a tooltip is purely visual (aria-hidden, text only), and
    // one opened by focus return sits over the neighbouring control and would otherwise swallow its clicks.
    // The positioner is held to the room Base UI measures for it, so a popup that outgrows the screen at enlarged text sits inside the
    // collision padding instead of ending past the screen's edge.
    positioner: `pointer-events-none z-(--z-tooltip) ${CAP.available}`,
    // The AT-REST description (#2455). `sr-only` is `position:absolute`, so this copy is out of flow: it
    // is not a flex/grid item anywhere a `<Tooltip>` is composed and costs its row no gap.
    description: "sr-only",
    // `max-w` is the prose measure: a tooltip sentence wraps at a readable line instead of spanning the
    // viewport over the rows beside its trigger. `wrap-anywhere` also counts the break points in the popup's min-content, so a word
    // wider than the screen breaks inside the popup instead of sizing it past the screen's edge.
    popup: `
      rounded-control border border-border bg-popover px-row py-field text-label leading-label text-pretty wrap-anywhere text-popover-foreground shadow-overlay
      max-inline-(--reading-measure-prose) tone-host-popover
      ${OVERLAY_MOTION.anchoredPopup}
    `,
    arrow: OVERLAY_ARROW,
  },
});

export const tooltipPopupBoxVariants = tv({
  variants: {
    passThrough: PASS_THROUGH,
  },
});
