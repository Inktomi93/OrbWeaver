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
 * Slot classes for the dialog overlay stack (ui-package-design §5 — slots for multi-part).
 * Backdrop is the theme-aware `--scrim` token (D43 §11.4 — never `bg-black/50`); the stack sits at
 * `--z-modal`. Enter/exit animation rides Base UI's `data-starting-style`/`data-ending-style`.
 */
export const dialogVariants = tv(
  {
    slots: {
      backdrop:
        "fixed inset-0 z-(--z-modal) bg-scrim transition-opacity duration-(--motion-base) ease-out-expo data-starting-style:opacity-0 data-ending-style:opacity-0",
      viewport: "fixed inset-0 z-(--z-modal) grid place-items-center overflow-y-auto p-gutter",
      popup:
        "w-full max-w-cq-md rounded-card border border-border bg-popover p-section text-popover-foreground shadow-lg transition-all duration-(--motion-base) ease-out-expo data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
      title: "text-title leading-title font-semibold",
      description: "mt-field text-body leading-body text-muted-foreground",
    },
  },
  { twMergeConfig },
);
