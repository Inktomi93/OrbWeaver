import { tv } from "#lib";

/**
 * Slot classes for the tooltip stack (ui-package-design §5). Positioner carries `--z-tooltip`
 * (above every other layer); popup animates on `data-starting-style`/`data-ending-style`.
 */
export const tooltipVariants = tv({
  slots: {
    positioner: "z-(--z-tooltip)",
    popup:
      "rounded-control border border-border bg-popover px-row py-field text-label leading-label text-popover-foreground shadow-md origin-(--transform-origin) transition-all duration-(--motion-fast) ease-out-expo data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
    // Base UI positions the arrow against the anchor and sets data-side; skinned as a `bg-popover`
    // diamond that continues the popup edge (mirrors PopoverArrow/MenuArrow).
    arrow: "size-row rotate-45 border border-border bg-popover",
  },
});
