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
 * Slot classes for the menu stack (ui-package-design §5). Positioner carries `--z-overlay`;
 * items meet the ≥44px touch floor via `min-h-control-sm` (UI-Arch §4b axis 3, gate
 * touch-target-floor); highlight rides Base UI's `data-highlighted`.
 */
export const menuVariants = tv(
  {
    slots: {
      positioner: "z-(--z-overlay)",
      popup:
        "rounded-card border border-border bg-popover p-field text-popover-foreground shadow-lg transition-all duration-(--motion-fast) ease-out-expo data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
      item: "flex min-h-control-sm cursor-default items-center gap-row rounded-control px-row text-body leading-body outline-none select-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground",
      separator: "my-field border-t border-border",
      group: "",
      groupLabel: "px-row py-field text-label leading-label text-muted-foreground",
    },
  },
  { twMergeConfig },
);
