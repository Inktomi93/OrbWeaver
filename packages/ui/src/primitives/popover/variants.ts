import { tv } from "#lib";

/**
 * Slot classes for the popover stack (ui-package-design §5). Positioner carries `--z-overlay`;
 * popup animates on Base UI's `data-starting-style`/`data-ending-style`.
 */
export const popoverVariants = tv({
  slots: {
    positioner: "z-(--z-popover)",
    backdrop:
      "fixed inset-0 z-(--z-popover) bg-scrim transition-opacity duration-(--motion-fast) ease-out-expo data-starting-style:opacity-0 data-ending-style:opacity-0",
    popup:
      "max-w-cq-sm rounded-card border border-border bg-popover p-block text-popover-foreground shadow-md origin-(--transform-origin) transition-all duration-(--motion-fast) ease-out-expo data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
    // Base UI positions the arrow against the anchor and sets data-side; we skin it as a rotated
    // bordered square that reads as the popup edge continuing to a point.
    arrow: "size-row rotate-45 border border-border bg-popover",
    title: "text-title leading-title font-semibold",
    description: "mt-field text-body leading-body text-muted-foreground",
  },
});
