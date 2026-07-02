import { tv } from "tailwind-variants";

// Teach tailwind-merge the type-scale tokens: by default it classifies unknown `text-*` values as
// COLORS, so `text-label` + `text-muted-foreground` "conflict" and the size token is silently
// dropped (recorded tailwind-variants-v3 delta — hoist to #lib if a third copy appears).
const twMergeConfig = {
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "headline", "title", "body", "label", "code"] }],
    },
  },
};

/**
 * Slot classes for the popover stack (ui-package-design §5). Positioner carries `--z-overlay`;
 * popup animates on Base UI's `data-starting-style`/`data-ending-style`.
 */
export const popoverVariants = tv(
  {
    slots: {
      positioner: "z-(--z-overlay)",
      backdrop:
        "fixed inset-0 z-(--z-overlay) bg-scrim transition-opacity duration-(--motion-fast) ease-out-expo data-starting-style:opacity-0 data-ending-style:opacity-0",
      popup:
        "max-w-cq-sm rounded-card border border-border bg-popover p-block text-popover-foreground shadow-md transition-all duration-(--motion-fast) ease-out-expo data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
      // Base UI positions the arrow against the anchor and sets data-side; we skin it as a rotated
      // bordered square that reads as the popup edge continuing to a point.
      arrow: "size-row rotate-45 border border-border bg-popover",
      title: "text-title leading-title font-semibold",
      description: "mt-field text-body leading-body text-muted-foreground",
    },
  },
  { twMergeConfig },
);
