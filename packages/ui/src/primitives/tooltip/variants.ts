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
 * Slot classes for the tooltip stack (ui-package-design §5). Positioner carries `--z-tooltip`
 * (above every other layer); popup animates on `data-starting-style`/`data-ending-style`.
 */
export const tooltipVariants = tv(
  {
    slots: {
      positioner: "z-(--z-tooltip)",
      popup:
        "rounded-control border border-border bg-popover px-row py-field text-label leading-label text-popover-foreground shadow-md transition-all duration-(--motion-fast) ease-out-expo data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
    },
  },
  { twMergeConfig },
);
